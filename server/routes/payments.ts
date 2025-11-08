import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { Payment } from "../models/sql/Payment.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import paypalService from "../services/paypal";
import { config } from "../config/env";
import { Op } from 'sequelize';

const router = Router();

/**
 * Create a payment order
 * POST /api/payments/create-order
 */
router.post("/create-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId, jobId, paymentType, amount, description } = req.body;
    const userId = req.user.id;

    // Handle job publication payment
    if (paymentType === "job_publication" && jobId) {
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Job not found" });
        return;
      }

      // Verify user owns the job (use clientId for PostgreSQL)
      if (job.clientId !== userId) {
        res.status(403).json({ success: false, message: "Unauthorized - You don't own this job" });
        return;
      }

      // Get user's commission rate and free contracts
      const user = await User.findByPk(userId);
      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      // Check if user has free contracts remaining (initial free contracts)
      // freeContractsRemaining starts at 3 for first 1000 users, otherwise 0
      if (user.freeContractsRemaining > 0) {
        // User has initial free contracts, publish directly without payment
        job.status = 'open';
        job.publicationAmount = 0;
        await job.save();

        // Decrement free contracts remaining
        user.freeContractsRemaining = user.freeContractsRemaining - 1;
        await user.save();

        res.json({
          success: true,
          message: "Job published successfully (free contract)",
          requiresPayment: false,
          job: job,
        });
        return;
      }

      // Check monthly free contracts for PRO users (resets every month)
      // PRO: 1 contract/month, SUPER_PRO: 2 contracts/month
      let monthlyFreeLimit = 0;
      if (user.membershipTier === 'super_pro') monthlyFreeLimit = 2;
      else if (user.membershipTier === 'pro') monthlyFreeLimit = 1;

      const proContractsUsed = user.proContractsUsedThisMonth || 0;
      if (proContractsUsed < monthlyFreeLimit) {
        // User has monthly free contracts without commission
        job.status = 'open';
        job.publicationAmount = 0;
        await job.save();

        // Increment monthly contracts used
        user.proContractsUsedThisMonth = proContractsUsed + 1;
        await user.save();

        res.json({
          success: true,
          message: "Job published successfully (monthly free contract)",
          requiresPayment: false,
          job: job,
        });
        return;
      }

      // Calculate commission rate for paid contracts
      let commissionRate = 8; // Default FREE
      if (user.membershipTier === 'super_pro') commissionRate = 2;
      else if (user.membershipTier === 'pro') commissionRate = 3;

      // Calculate publication cost with minimum (use price field for PostgreSQL)
      const MINIMUM_CONTRACT_AMOUNT = 8000;
      const MINIMUM_COMMISSION = 1000;
      const jobPrice = parseFloat(job.price as any) || 0;
      let publicationCost = 0;

      if (jobPrice < MINIMUM_CONTRACT_AMOUNT) {
        publicationCost = MINIMUM_COMMISSION;
      } else {
        publicationCost = jobPrice * (commissionRate / 100);
      }

      const totalAmountARS = publicationCost;

      // Convert ARS to USD (PayPal only accepts USD)
      const currencyService = (await import('../services/currencyExchange.js')).default;
      const exchangeRate = await currencyService.getUSDtoARSRate();
      const totalAmountUSD = totalAmountARS / exchangeRate;

      console.log(`💵 Job publication payment: ${totalAmountARS} ARS = ${totalAmountUSD.toFixed(2)} USD (rate: ${exchangeRate})`);

      // Create PayPal order in USD
      const paypalOrder = await paypalService.createOrder({
        amount: totalAmountUSD.toFixed(2),
        currency: "USD",
        description: `Publicación: ${job.title} (${totalAmountARS.toFixed(2)} ARS)`,
        jobId: jobId,
        paymentType: "job_publication",
      });

      // Extract approval URL from PayPal links
      const approvalLink = paypalOrder.links?.find((link: any) => link.rel === 'approve')?.href;
      if (!approvalLink) {
        throw new Error('No se pudo obtener el link de aprobación de PayPal');
      }

      // Create payment record in database
      const payment = await Payment.create({
        contractId: null,
        payerId: userId,
        recipientId: null,
        amount: totalAmountUSD,
        currency: "USD",
        status: "pending",
        paymentType: "job_publication",
        paypalOrderId: paypalOrder.orderId,
        description: `Publicación: ${job.title} (${totalAmountARS.toFixed(2)} ARS)`,
        platformFee: 0,
        platformFeePercentage: 0,
        isEscrow: false,
      });

      // Update job with publication amount in ARS and payment reference
      job.publicationAmount = totalAmountARS;
      job.publicationPaymentId = payment.id;
      await job.save();

      res.json({
        success: true,
        orderId: paypalOrder.orderId,
        approvalUrl: approvalLink,
        paymentId: payment.id,
      });
      return;
    }

    // Handle contract payment (existing logic)
    if (!contractId) {
      res.status(400).json({ success: false, message: "Contract ID is required" });
      return;
    }

    // Validate contract
    const contract = await Contract.findByPk(contractId);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is part of the contract
    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Determine payer and recipient
    let payerId = userId;
    let recipientId = contract.clientId === userId
      ? contract.doerId
      : contract.clientId;

    // Calculate platform fee
    const platformFee = paypalService.calculatePlatformFee(parseFloat(amount));
    const totalAmount = parseFloat(amount) + platformFee;

    // Create PayPal order
    const paypalOrder = await paypalService.createOrder({
      amount: totalAmount.toFixed(2),
      currency: "USD",
      description: description || `Payment for contract ${contract.title}`,
      contractId: contractId,
    });

    // Create payment record
    const payment = await Payment.create({
      contractId,
      payerId,
      recipientId,
      amount: parseFloat(amount),
      currency: "USD",
      status: "pending",
      paymentType: "contract_payment",
      paypalOrderId: paypalOrder.orderId,
      description,
      platformFee,
      platformFeePercentage: config.paypalPlatformFeePercentage,
      isEscrow: contract.escrowEnabled || false,
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: paypalOrder.orderId,
        approvalUrl: paypalOrder.links?.find((link: any) => link.rel === "approve")?.href,
        amount: totalAmount,
        platformFee,
      },
    });
  } catch (error: any) {
    console.error("Create payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Capture a payment after approval
 * POST /api/payments/capture-order
 */
router.post("/capture-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    console.log("🔍 [CAPTURE] Step 1 - Starting capture process");
    console.log("🔍 [CAPTURE] OrderId:", orderId);
    console.log("🔍 [CAPTURE] UserId:", userId);

    // Find payment by order ID
    const payment = await Payment.findOne({ where: { paypalOrderId: orderId } });
    console.log("🔍 [CAPTURE] Step 2 - Payment found:", payment ? "YES" : "NO");

    if (!payment) {
      console.error("❌ [CAPTURE] Payment not found for orderId:", orderId);
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    console.log("🔍 [CAPTURE] Payment ID:", payment.id);
    console.log("🔍 [CAPTURE] Payment Status:", payment.status);
    console.log("🔍 [CAPTURE] Payment Type:", payment.paymentType);
    console.log("🔍 [CAPTURE] Is Escrow:", payment.isEscrow);

    // Verify user is the payer
    if (payment.payerId !== userId) {
      console.error("❌ [CAPTURE] Unauthorized - PayerId:", payment.payerId, "vs UserId:", userId);
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    console.log("🔍 [CAPTURE] Step 3 - Authorization verified");

    // Capture the PayPal order
    console.log("🔍 [CAPTURE] Step 4 - Calling PayPal captureOrder...");
    const captureResult = await paypalService.captureOrder(orderId);
    console.log("✅ [CAPTURE] PayPal capture result:", JSON.stringify(captureResult, null, 2));

    // Update payment record
    console.log("🔍 [CAPTURE] Step 5 - Updating payment record...");
    payment.status = captureResult.status === "COMPLETED" ? "completed" : "processing";
    payment.paypalCaptureId = captureResult.captureId;
    payment.paypalPayerId = captureResult.payerId;
    payment.paypalPayerEmail = captureResult.payerEmail;

    if (payment.isEscrow) {
      console.log("🔍 [CAPTURE] Setting status to 'held_escrow'");
      payment.status = "held_escrow";
    }

    await payment.save();
    console.log("✅ [CAPTURE] Step 6 - Payment record updated. New status:", payment.status);

    // Handle membership payment
    if (payment.paymentType === "membership" || payment.description?.includes("Membresía")) {
      console.log("🔍 [CAPTURE] Step 7 - Detected membership payment");
      console.log("💳 Procesando pago de membresía...");

      // Activar membresía
      const { Membership } = await import('../models/sql/Membership.model.js');
      const currencyExchange = (await import('../services/currencyExchange.js')).default;

      // Determinar el plan según la descripción o monto
      let plan: "PRO" | "SUPER_PRO" = "PRO";
      let priceUSD = 5.99; // PRO price

      if (payment.description?.includes("SUPER PRO") || payment.amount >= 8.99) {
        plan = "SUPER_PRO";
        priceUSD = 8.99;
      }

      console.log(`📊 Plan detectado: ${plan}`);

      // Obtener tasa de cambio actual
      const exchangeRate = await currencyExchange.getUSDtoARSRate();
      const priceARS = await currencyExchange.convertUSDtoARS(priceUSD);

      console.log(`💱 Tasa de cambio: 1 USD = ${exchangeRate} ARS`);
      console.log(`💵 Precio: ${priceUSD} USD = ${priceARS} ARS`);

      // Buscar o crear membresía
      let membership = await Membership.findOne({ where: { userId: payment.payerId } });

      if (membership) {
        // Verificar si es un upgrade (PRO → SUPER PRO)
        const isUpgrade = membership.plan === 'PRO' && plan === 'SUPER_PRO' && membership.status === 'active';

        // Actualizar membresía existente
        membership.plan = plan;
        membership.status = "active";

        if (isUpgrade && membership.endDate) {
          // Es upgrade: mantener la fecha de fin actual (solo cambiamos el plan)
          console.log(`🔄 Upgrade detectado: manteniendo fecha de fin ${membership.endDate}`);
          // NO modificar startDate ni endDate, solo actualizar el plan
        } else {
          // Nueva membresía o renovación: establecer 30 días desde ahora
          membership.startDate = new Date();
          membership.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
          membership.nextPaymentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        membership.lastPaymentId = payment.id as any;
        membership.lastPaymentDate = new Date();
        membership.priceUSD = priceUSD;
        membership.priceARS = priceARS;
        membership.exchangeRateAtPurchase = exchangeRate;
        membership.reducedCommissionPercentage = plan === "SUPER_PRO" ? 2 : 3;
        await membership.save();
        console.log("✅ Membresía actualizada", isUpgrade ? "(upgrade)" : "(renovación)");
      } else {
        // Crear nueva membresía
        membership = await Membership.create({
          userId: payment.payerId,
          plan,
          status: "active",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          priceUSD,
          priceARS,
          exchangeRateAtPurchase: exchangeRate,
          lastPaymentId: payment.id,
          lastPaymentDate: new Date(),
          nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          freeContractsTotal: 3,
          freeContractsUsed: 0,
          freeContractsRemaining: 3,
          reducedCommissionPercentage: plan === "SUPER_PRO" ? 2 : 3,
        });
        console.log("✅ Membresía creada");
      }

      // Actualizar usuario
      const user = await User.findByPk(payment.payerId);
      if (user) {
        user.hasMembership = true;
        user.membershipTier = plan === "SUPER_PRO" ? "super_pro" : "pro";
        user.monthlyFreeContractsLimit = 3;
        user.monthlyContractsUsed = 0;
        await user.save();
        console.log("✅ Usuario actualizado con membresía", plan);
      }

      // Notificar usuario
      await Notification.create({
        recipientId: payment.payerId,
        type: "success",
        category: "payment",
        title: `Membresía ${plan} activada`,
        message: `Tu membresía ${plan} ha sido activada exitosamente. Disfruta de todos los beneficios.`,
        relatedModel: "Membership",
        relatedId: membership.id,
        sentVia: ["in_app"],
      });

      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          captureId: captureResult.captureId,
          status: payment.status,
          membershipId: membership.id,
          membershipActivated: true,
          plan,
        },
      });
      return;
    }

    // Handle job publication payment
    if (payment.paymentType === "job_publication") {
      console.log("🔍 [CAPTURE] Step 7 - Detected job publication payment");
      // Find the job and publish it
      const job = await Job.findOne({ where: { publicationPaymentId: payment.id } });
      if (job) {
        job.status = "open";
        job.publicationPaid = true;
        job.publicationPaidAt = new Date();
        await job.save();

        // Notify user that job is published
        await Notification.create({
          recipientId: payment.payerId,
          type: "success",
          category: "payment",
          title: "Trabajo publicado",
          message: `Tu trabajo "${job.title}" ha sido publicado exitosamente. Los profesionales pueden ahora enviar propuestas.`,
          relatedModel: "Job",
          relatedId: job.id,
          sentVia: ["in_app"],
        });

        res.json({
          success: true,
          data: {
            paymentId: payment.id,
            captureId: captureResult.captureId,
            status: payment.status,
            jobId: job.id,
            jobPublished: true,
          },
        });
        return;
      }
    }

    // Update contract payment status (for contract payments)
    console.log("🔍 [CAPTURE] Step 7 - Processing contract payment...");
    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      console.log("🔍 [CAPTURE] Contract found:", contract.id);
      contract.paymentStatus = payment.isEscrow ? "escrow" : "completed";
      await contract.save();
      console.log("✅ [CAPTURE] Contract updated. Payment status:", contract.paymentStatus);
    } else {
      console.log("⚠️ [CAPTURE] No contract found for contractId:", payment.contractId);
    }

    // Create notifications (for contract payments)
    const payer = await User.findByPk(payment.payerId);
    const recipient = await User.findByPk(payment.recipientId);

    if (recipient) {
      await Notification.create({
        recipientId: payment.recipientId,
        type: "success",
        category: "payment",
        title: "Pago recibido",
        message: payment.isEscrow
          ? `${payer?.name} ha depositado $${payment.amount} en escrow para el contrato`
          : `Has recibido un pago de $${payment.amount} de ${payer?.name}`,
        relatedModel: "Payment",
        relatedId: payment.id,
        sentVia: ["in_app"],
      });
    }

    await Notification.create({
      recipientId: payment.payerId,
      type: "info",
      category: "payment",
      title: "Pago enviado",
      message: payment.isEscrow
        ? `Tu pago de $${payment.amount} está en escrow hasta que se complete el trabajo`
        : `Has enviado $${payment.amount} a ${recipient?.name}`,
      relatedModel: "Payment",
      relatedId: payment.id,
      sentVia: ["in_app"],
    });

    console.log("✅ [CAPTURE] Step 8 - Capture process completed successfully");
    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        captureId: captureResult.captureId,
        status: payment.status,
      },
    });
  } catch (error: any) {
    console.error("❌❌❌ [CAPTURE ERROR] ❌❌❌");
    console.error("❌ [CAPTURE ERROR] Message:", error.message);
    console.error("❌ [CAPTURE ERROR] Stack:", error.stack);
    console.error("❌ [CAPTURE ERROR] Full error:", JSON.stringify(error, null, 2));
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Release escrow payment (for completed work)
 * POST /api/payments/:paymentId/release-escrow
 */
router.post("/:paymentId/release-escrow", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is the payer (client releasing payment)
    if (payment.payerId !== userId) {
      res.status(403).json({ success: false, message: "Only the payer can release escrow" });
      return;
    }

    if (!payment.isEscrow || payment.status !== "held_escrow") {
      res.status(400).json({ success: false, message: "Payment is not in escrow" });
      return;
    }

    // Release escrow
    payment.status = "completed";
    payment.escrowReleasedAt = new Date();
    payment.escrowReleasedBy = userId;
    await payment.save();

    // Update contract
    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      contract.paymentStatus = "completed";
      await contract.save();
    }

    // Notify recipient
    const recipient = await User.findByPk(payment.recipientId);
    await Notification.create({
      recipientId: payment.recipientId,
      type: "success",
      category: "payment",
      title: "Pago liberado",
      message: `El escrow de $${payment.amount} ha sido liberado. El pago está disponible.`,
      relatedModel: "Payment",
      relatedId: payment.id,
      sentVia: ["in_app"],
    });

    res.json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Release escrow error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Refund a payment
 * POST /api/payments/:paymentId/refund
 */
router.post("/:paymentId/refund", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Only allow refund if user is recipient or admin
    const user = await User.findByPk(userId);
    if (payment.recipientId !== userId && !user?.adminRole) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (payment.status === "refunded") {
      res.status(400).json({ success: false, message: "Payment already refunded" });
      return;
    }

    if (!payment.paypalCaptureId) {
      res.status(400).json({ success: false, message: "Payment cannot be refunded" });
      return;
    }

    // Process refund through PayPal
    const refundResult = await paypalService.refundPayment(
      payment.paypalCaptureId,
      payment.amount.toString(),
      payment.currency
    );

    // Update payment
    payment.status = "refunded";
    payment.refundReason = reason;
    payment.refundedAt = new Date();
    payment.refundedBy = userId;
    await payment.save();

    // Update contract
    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      contract.paymentStatus = "refunded";
      await contract.save();
    }

    // Notify payer
    await Notification.create({
      recipientId: payment.payerId,
      type: "info",
      category: "payment",
      title: "Pago reembolsado",
      message: `Tu pago de $${payment.amount} ha sido reembolsado. Razón: ${reason}`,
      relatedModel: "Payment",
      relatedId: payment.id,
      sentVia: ["in_app"],
    });

    res.json({ success: true, data: { payment, refundId: refundResult.refundId } });
  } catch (error: any) {
    console.error("Refund payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get payment details
 * GET /api/payments/:paymentId
 */
router.get("/:paymentId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findByPk(paymentId, {
      include: [
        { model: User, as: 'payer', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['name', 'email', 'avatar'] },
        { model: Contract, as: 'contract', attributes: ['title', 'description'] }
      ]
    });

    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is part of the payment
    if (
      payment.payerId !== userId &&
      payment.recipientId !== userId
    ) {
      const user = await User.findByPk(userId);
      if (!user?.adminRole) {
        res.status(403).json({ success: false, message: "Unauthorized" });
        return;
      }
    }

    res.json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Get payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get user payments (sent and received)
 * GET /api/payments/my/list
 */
router.get("/my/list", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { type = "all", page = 1, limit = 20 } = req.query;

    let whereClause: any = {};
    if (type === "sent") {
      whereClause.payerId = userId;
    } else if (type === "received") {
      whereClause.recipientId = userId;
    } else {
      whereClause[Op.or] = [{ payerId: userId }, { recipientId: userId }];
    }

    const payments = await Payment.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'payer', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['name', 'email', 'avatar'] },
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'status', 'price'],
          include: [{
            model: Job,
            as: 'job',
            attributes: ['title']
          }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit)
    });

    const total = await Payment.count({ where: whereClause });

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Get payments error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get contract payments
 * GET /api/payments/contract/:contractId
 */
router.get("/contract/:contractId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;

    const contract = await Contract.findByPk(contractId);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is part of the contract
    if (
      contract.clientId !== userId &&
      contract.doerId !== userId
    ) {
      const user = await User.findByPk(userId);
      if (!user?.adminRole) {
        res.status(403).json({ success: false, message: "Unauthorized" });
        return;
      }
    }

    const payments = await Payment.findAll({
      where: { contractId },
      include: [
        { model: User, as: 'payer', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['name', 'email', 'avatar'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: payments });
  } catch (error: any) {
    console.error("Get contract payments error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PayPal webhook handler
 * POST /api/payments/webhook
 */
router.post("/webhook", async (req, res): Promise<void> => {
  try {
    const webhookEvent = req.body;

    // TODO: Verify webhook signature for security
    // const isValid = await paypalService.verifyWebhookSignature(req.headers, req.body, WEBHOOK_ID);
    // if (!isValid) {
    //   res.status(400).json({ success: false, message: "Invalid webhook signature" });
    //   return;
    // }

    // Handle different event types
    switch (webhookEvent.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        // Payment captured successfully
        console.log("Payment captured:", webhookEvent.resource.id);
        break;

      case "PAYMENT.CAPTURE.DENIED":
        // Payment denied
        console.log("Payment denied:", webhookEvent.resource.id);
        break;

      case "PAYMENT.CAPTURE.REFUNDED":
        // Payment refunded
        console.log("Payment refunded:", webhookEvent.resource.id);
        break;

      default:
        console.log("Unhandled webhook event:", webhookEvent.event_type);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Create payment for job publication
 * POST /api/payments/job-publication/:jobId
 */
router.post("/job-publication/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    // Find the job
    const job = await Job.findByPk(jobId);
    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }

    // Verify user is the owner
    if (job.client !== userId) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Verify job status
    if (job.status !== "draft" && job.status !== "pending_payment") {
      res.status(400).json({ success: false, message: "Job already published or invalid status" });
      return;
    }

    // Check if already paid
    if (job.publicationPaid) {
      res.status(400).json({ success: false, message: "Job publication already paid" });
      return;
    }

    const amount = job.publicationAmount || 10; // Default $10 USD

    // Create PayPal order
    const paypalOrder = await paypalService.createOrder({
      amount: amount.toFixed(2),
      currency: "USD",
      description: `Publicación de trabajo: ${job.title}`,
      contractId: jobId,
      returnUrl: `${config.clientUrl}/payment/success?type=job-publication&jobId=${jobId}`,
      cancelUrl: `${config.clientUrl}/payment/cancel?type=job-publication&jobId=${jobId}`,
    });

    // Create payment record
    const payment = await Payment.create({
      contractId: null,
      payerId: userId,
      recipientId: null,
      amount,
      currency: "USD",
      status: "pending",
      paymentType: "job_publication",
      paypalOrderId: paypalOrder.orderId,
      description: `Publicación: ${job.title}`,
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
    });

    // Update job with payment reference
    job.publicationPaymentId = payment.id;
    job.status = "pending_payment";
    await job.save();

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: paypalOrder.orderId,
        approvalUrl: paypalOrder.links?.find((link: any) => link.rel === "approve")?.href,
        amount,
      },
    });
  } catch (error: any) {
    console.error("Create job publication payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Create a MercadoPago payment for contract with escrow
 * POST /api/payments/contract/:contractId
 */
router.post("/contract/:contractId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;

    // Find the contract
    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: Job, as: 'job' },
        { model: User, as: 'client' },
        { model: User, as: 'doer' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is the client
    if ((contract.client as any).id !== userId) {
      res.status(403).json({ success: false, message: "Only the client can pay for this contract" });
      return;
    }

    // Check if already paid
    if (contract.status === "active" || contract.status === "completed") {
      res.status(400).json({ success: false, message: "Contract already paid" });
      return;
    }

    // Check for existing payment
    const existingPayment = await Payment.findOne({
      where: {
        contractId: contract.id,
        status: { [Op.in]: ["pending", "approved", "held_escrow"] }
      }
    });

    if (existingPayment) {
      res.status(400).json({ success: false, message: "Payment already exists for this contract" });
      return;
    }

    const jobTitle = (contract.job as any).title || 'Contrato';

    // Create MercadoPago preference
    const mercadoPagoService = (await import('../services/mercadopago.js')).default;
    const preference = await mercadoPagoService.createPreference({
      title: `Contrato: ${jobTitle}`,
      description: `Pago con escrow para ${jobTitle}`,
      price: contract.totalPrice,
      contractId: contract.id.toString(),
      clientId: userId.toString(),
      doerId: (contract.doer as any).id.toString(),
    });

    // Create payment record with escrow
    const payment = await Payment.create({
      contractId: contract.id,
      payerId: userId,
      recipientId: (contract.doer as any).id,
      amount: contract.totalPrice,
      currency: "ARS",
      status: "pending",
      paymentType: "contract",
      mercadoPagoPreferenceId: preference.id,
      description: `Contrato: ${jobTitle}`,
      platformFee: contract.commission,
      platformFeePercentage: contract.commission > 0 ? ((contract.commission / contract.price) * 100) : 0,
      isEscrow: true,
      escrowStatus: "pending",
    });

    // Update contract with payment reference
    contract.paymentId = payment.id as any;
    await contract.save();

    res.json({
      success: true,
      paymentUrl: preference.init_point,
      paymentId: payment.id,
      preferenceId: preference.id,
    });
  } catch (error: any) {
    console.error("Create contract payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error creating payment" });
  }
});

export default router;
