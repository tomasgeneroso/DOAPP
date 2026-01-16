import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/permissions.js";
import { Payment } from "../models/sql/Payment.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { PaymentProof } from "../models/sql/PaymentProof.model.js";
import mercadopagoService from "../services/mercadopago.js";
import currencyExchange from "../services/currencyExchange.js";
import { config } from "../config/env.js";
import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import logger from "../services/logger.js";
import { socketService } from "../index.js";
import { calculateCommission } from "../services/commissionService.js";

// Ensure upload directory exists
const PAYMENT_PROOFS_DIR = path.join(process.cwd(), 'uploads', 'payment-proofs');
if (!fs.existsSync(PAYMENT_PROOFS_DIR)) {
  fs.mkdirSync(PAYMENT_PROOFS_DIR, { recursive: true });
}

// Configure multer for payment proof uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PAYMENT_PROOFS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG) o PDF'));
    }
  }
});

const router = Router();

/**
 * Create a payment order (supports multiple payment methods)
 * POST /api/payments/create-order
 * Supports: FormData with optional file upload
 */
router.post("/create-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId, jobId, paymentType, amount, description, paymentMethod } = req.body;
    const userId = req.user.id;
    const selectedPaymentMethod = paymentMethod || 'mercadopago'; // Default to MercadoPago

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

      // Calculate commission using volume-based service
      const jobPrice = parseFloat(job.price as any) || 0;
      const commissionResult = await calculateCommission(userId, jobPrice);
      const publicationCost = commissionResult.commission;

      // Total amount = job price + publication commission
      const totalAmountARS = jobPrice + publicationCost;

      console.log(`💵 Job publication payment: ${totalAmountARS.toFixed(2)} ARS (job: ${jobPrice.toFixed(2)}, commission: ${publicationCost.toFixed(2)}) - ${selectedPaymentMethod}`);

      // Handle different payment methods
      if (selectedPaymentMethod === 'bank_transfer') {
        // Bank Transfer - requires manual verification
        const payment = await Payment.create({
          contractId: null,
          payerId: userId,
          recipientId: null,
          amount: totalAmountARS,
          currency: "ARS",
          status: "pending_verification", // Special status for bank transfers
          paymentType: "job_publication",
          paymentMethod: "bank_transfer",
          description: `Publicación: ${job.title}`,
          platformFee: 0,
          platformFeePercentage: 0,
          isEscrow: false,
        });

        // Update job with publication amount and payment reference
        job.publicationAmount = totalAmountARS;
        job.publicationPaymentId = payment.id;
        job.status = 'pending_payment'; // Job won't be published until payment is verified
        await job.save();

        res.json({
          success: true,
          message: "Transferencia bancaria iniciada. Sube el comprobante para verificación.",
          requiresPayment: true,
          paymentId: payment.id,
          amount: totalAmountARS,
          bankDetails: {
            accountHolder: process.env.BANK_ACCOUNT_HOLDER || 'DOAPP S.R.L.',
            cuit: process.env.BANK_CUIT || '30-12345678-9',
            bank: process.env.BANK_NAME || 'Banco Galicia',
            cbu: process.env.BANK_CBU || '0070099920000123456789',
            alias: process.env.BANK_ALIAS || 'DOAPP.PAGOS',
          }
        });
        return;
      }

      // Default: MercadoPago direct integration
      const mpPayment = await mercadopagoService.createPayment({
        amount: totalAmountARS,
        currency: 'ARS',
        description: `Publicación: ${job.title}`,
        provider: 'mercadopago',
        metadata: {
          jobId: jobId,
          userId: userId,
          paymentType: 'job_publication',
        },
        customerEmail: req.user.email,
        successUrl: `${process.env.CLIENT_URL}/payment/success?type=job_publication&jobId=${jobId}`,
        cancelUrl: `${process.env.CLIENT_URL}/payment/failure?type=job_publication&jobId=${jobId}`,
      });

      console.log('🔍 [DEBUG] MercadoPago payment response:', JSON.stringify(mpPayment, null, 2));

      if (!mpPayment.checkoutUrl) {
        throw new Error('No se pudo obtener el link de pago de MercadoPago');
      }

      console.log('🌐 [DEBUG] Checkout URL:', mpPayment.checkoutUrl);

      // Create payment record in database
      const payment = await Payment.create({
        contractId: null,
        payerId: userId,
        recipientId: null,
        amount: totalAmountARS,
        currency: "ARS",
        status: "pending",
        paymentType: "job_publication",
        paymentMethod: "mercadopago",
        mercadopagoPreferenceId: mpPayment.paymentId,
        description: `Publicación: ${job.title}`,
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
        preferenceId: mpPayment.paymentId,
        approvalUrl: mpPayment.checkoutUrl,
        paymentId: payment.id,
        amount: totalAmountARS,
      });
      return;
    }

    // Handle budget increase payment
    if (paymentType === "budget_increase" && jobId) {
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Job not found" });
        return;
      }

      // Verify user owns the job
      if (job.clientId !== userId) {
        res.status(403).json({ success: false, message: "Unauthorized - You don't own this job" });
        return;
      }

      // Verify the job has pending payment amount
      const pendingAmount = parseFloat(job.pendingPaymentAmount as any) || 0;
      if (pendingAmount <= 0) {
        res.status(400).json({ success: false, message: "No pending payment amount for this job" });
        return;
      }

      // Use the amount from the request or the job's pending payment
      const totalAmountARS = amount ? parseFloat(amount) : pendingAmount;

      console.log(`💵 Budget increase payment: ${totalAmountARS.toFixed(2)} ARS for job ${jobId} - ${selectedPaymentMethod}`);

      // Handle different payment methods
      if (selectedPaymentMethod === 'bank_transfer' || selectedPaymentMethod === 'binance') {
        // Bank Transfer or Binance - requires manual verification
        const payment = await Payment.create({
          contractId: null,
          payerId: userId,
          recipientId: null,
          amount: totalAmountARS,
          currency: "ARS",
          status: "pending_verification",
          paymentType: "budget_increase",
          paymentMethod: selectedPaymentMethod,
          description: `Aumento de presupuesto: ${job.title}`,
          platformFee: 0,
          platformFeePercentage: 0,
          isEscrow: false,
        });

        // Update job with payment reference
        job.publicationPaymentId = payment.id;
        await job.save();

        res.json({
          success: true,
          message: selectedPaymentMethod === 'binance'
            ? "Pago con Binance iniciado. Sube el comprobante para verificación."
            : "Transferencia bancaria iniciada. Sube el comprobante para verificación.",
          requiresPayment: true,
          paymentId: payment.id,
          amount: totalAmountARS,
          bankDetails: selectedPaymentMethod === 'bank_transfer' ? {
            accountHolder: process.env.BANK_ACCOUNT_HOLDER || 'DOAPP S.R.L.',
            cuit: process.env.BANK_CUIT || '30-12345678-9',
            bank: process.env.BANK_NAME || 'Banco Galicia',
            cbu: process.env.BANK_CBU || '0070099920000123456789',
            alias: process.env.BANK_ALIAS || 'DOAPP.PAGOS',
          } : undefined
        });
        return;
      }

      // Default: MercadoPago direct integration
      const mpPayment = await mercadopagoService.createPayment({
        amount: totalAmountARS,
        currency: 'ARS',
        description: `Aumento de presupuesto: ${job.title}`,
        provider: 'mercadopago',
        metadata: {
          jobId: jobId,
          userId: userId,
          paymentType: 'budget_increase',
        },
        customerEmail: req.user.email,
        successUrl: `${process.env.CLIENT_URL}/payment/success?type=budget_increase&jobId=${jobId}`,
        cancelUrl: `${process.env.CLIENT_URL}/payment/failure?type=budget_increase&jobId=${jobId}`,
      });

      if (!mpPayment.checkoutUrl) {
        throw new Error('No se pudo obtener el link de pago de MercadoPago');
      }

      // Create payment record in database
      const payment = await Payment.create({
        contractId: null,
        payerId: userId,
        recipientId: null,
        amount: totalAmountARS,
        currency: "ARS",
        status: "pending",
        paymentType: "budget_increase",
        paymentMethod: "mercadopago",
        mercadopagoPreferenceId: mpPayment.paymentId,
        description: `Aumento de presupuesto: ${job.title}`,
        platformFee: 0,
        platformFeePercentage: 0,
        isEscrow: false,
      });

      // Update job with payment reference
      job.publicationPaymentId = payment.id;
      await job.save();

      res.json({
        success: true,
        preferenceId: mpPayment.paymentId,
        approvalUrl: mpPayment.checkoutUrl,
        paymentId: payment.id,
        amount: totalAmountARS,
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
 * Capture/Verify a payment after approval
 * POST /api/payments/capture-order
 *
 * For MercadoPago: payment_id from URL params or webhook
 * For PayPal (commented): orderId
 */
router.post("/capture-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, collection_id, preference_id } = req.body;
    const userId = req.user.id;

    console.log("🔍 [CAPTURE] Step 1 - Starting MercadoPago capture process");
    console.log("🔍 [CAPTURE] PaymentId:", paymentId);
    console.log("🔍 [CAPTURE] Collection ID:", collection_id);
    console.log("🔍 [CAPTURE] Preference ID:", preference_id);
    console.log("🔍 [CAPTURE] UserId:", userId);

    // MercadoPago: Find payment by preference ID or payment ID
    let payment = null;

    if (preference_id) {
      payment = await Payment.findOne({ where: { mercadopagoPreferenceId: preference_id } });
    } else if (paymentId || collection_id) {
      const mpPaymentId = paymentId || collection_id;
      payment = await Payment.findOne({ where: { mercadopagoPaymentId: mpPaymentId } });
    }

    console.log("🔍 [CAPTURE] Step 2 - Payment found:", payment ? "YES" : "NO");

    if (!payment) {
      console.error("❌ [CAPTURE] Payment not found");
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

    // Vexor/MercadoPago: Get payment info
    console.log("🔍 [CAPTURE] Step 4 - Getting MercadoPago payment info via Vexor...");
    const mpPaymentId = paymentId || collection_id;
    let captureResult: any = { status: "approved" };

    if (mpPaymentId) {
      try {
        const mpPaymentData = await mercadopagoService.getPayment(mpPaymentId, 'mercadopago');
        console.log("✅ [CAPTURE] MercadoPago payment result:", JSON.stringify(mpPaymentData, null, 2));

        // Update payment record with MercadoPago data
        payment.mercadopagoPaymentId = mpPaymentId;
        payment.mercadopagoStatus = mpPaymentData.status;
        payment.mercadopagoStatusDetail = mpPaymentData.status_detail || mpPaymentData.status;

        // MercadoPago returns 'approved' for successful payments, not 'succeeded'
        const isApproved = ['approved', 'succeeded', 'authorized'].includes(mpPaymentData.status);

        captureResult = {
          status: isApproved ? 'COMPLETED' : mpPaymentData.status?.toUpperCase() || 'PENDING',
          captureId: mpPaymentId,
          payerId: mpPaymentData.metadata?.payerId,
          payerEmail: mpPaymentData.metadata?.payerEmail,
          mpStatus: mpPaymentData.status, // Keep original MP status for debugging
        };
        console.log("🔍 [CAPTURE] MercadoPago status:", mpPaymentData.status, "-> captureResult.status:", captureResult.status);
      } catch (error: any) {
        logger.silentError('payments', 'Could not get MercadoPago payment info', error, {
          mpPaymentId,
          internalPaymentId: payment.id,
          userId
        });
        console.error("⚠️ [CAPTURE] Could not get MercadoPago payment, assuming approved");
        captureResult.status = "COMPLETED"; // If we can't verify, assume it worked since user returned from MP
      }
    }

    // Update payment record
    console.log("🔍 [CAPTURE] Step 5 - Updating payment record...");
    payment.status = captureResult.status === "COMPLETED" ? "completed" : "processing";

    if (payment.isEscrow) {
      console.log("🔍 [CAPTURE] Setting status to 'held_escrow'");
      payment.status = "held_escrow";
    }

    await payment.save();
    console.log("✅ [CAPTURE] Step 6 - Payment record updated. New status:", payment.status);

    // Log payment capture success
    logger.payment('CAPTURED', 'Payment captured successfully', {
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      userId,
      status: payment.status,
      provider: 'mercadopago'
    });

    /* ===== PAYPAL CODE (COMMENTED) =====
    // Find payment by order ID
    const payment = await Payment.findOne({ where: { paypalOrderId: orderId } });

    if (!payment) {
      console.error("❌ [CAPTURE] Payment not found for orderId:", orderId);
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Capture the PayPal order
    const captureResult = await paypalService.captureOrder(orderId);

    // Update payment record
    payment.status = captureResult.status === "COMPLETED" ? "completed" : "processing";
    payment.paypalCaptureId = captureResult.captureId;
    payment.paypalPayerId = captureResult.payerId;
    payment.paypalPayerEmail = captureResult.payerEmail;

    if (payment.isEscrow) {
      payment.status = "held_escrow";
    }

    await payment.save();
    ===== END PAYPAL CODE ===== */

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
          amount: payment.amount,
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
      const job = await Job.findOne({
        where: { publicationPaymentId: payment.id },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
          }
        ]
      });
      if (job) {
        const previousStatus = job.status;
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

        // Real-time notification: new job published
        socketService.notifyNewJob(job.toJSON());
        socketService.notifyJobStatusChanged(job.toJSON(), previousStatus);

        res.json({
          success: true,
          data: {
            paymentId: payment.id,
            captureId: captureResult.captureId,
            status: payment.status,
            amount: payment.amount,
            jobId: job.id,
            jobPublished: true,
          },
        });
        return;
      }
    }

    // Handle budget increase payment
    if (payment.paymentType === "budget_increase") {
      console.log("🔍 [CAPTURE] Step 7 - Detected budget increase payment");
      // Find the job and apply the new price
      const job = await Job.findOne({
        where: { publicationPaymentId: payment.id },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
          }
        ]
      });
      if (job && job.pendingNewPrice) {
        const oldPrice = Number(job.price);
        const newPrice = Number(job.pendingNewPrice);
        const previousStatus = job.previousStatus || 'open';

        // Agregar al historial de cambios
        const priceHistory = job.priceHistory || [];
        priceHistory.push({
          oldPrice,
          newPrice,
          reason: job.priceChangeReason || 'Aumento de presupuesto',
          changedAt: new Date(),
        });

        // Aplicar el nuevo precio y reactivar el trabajo
        await job.update({
          price: newPrice,
          priceChangedAt: new Date(),
          priceHistory,
          pendingNewPrice: null,
          pendingPaymentAmount: 0,
          previousStatus: null,
          status: previousStatus, // Restaurar estado anterior (usualmente 'open')
        });

        console.log(`✅ [CAPTURE] Budget increase applied: $${oldPrice} -> $${newPrice} for job ${job.id}`);

        // Notify user that budget was updated
        await Notification.create({
          recipientId: payment.payerId,
          type: "success",
          category: "payment",
          title: "Presupuesto actualizado",
          message: `El presupuesto de "${job.title}" ha sido actualizado a $${newPrice.toLocaleString('es-AR')} ARS. El trabajo ha sido reactivado.`,
          relatedModel: "Job",
          relatedId: job.id,
          sentVia: ["in_app"],
        });

        // Real-time notification
        socketService.notifyJobStatusChanged(job.toJSON(), 'paused');

        res.json({
          success: true,
          data: {
            paymentId: payment.id,
            captureId: captureResult.captureId,
            status: payment.status,
            amount: payment.amount,
            jobId: job.id,
            budgetUpdated: true,
            oldPrice,
            newPrice,
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
        amount: payment.amount,
        contractId: payment.contractId,
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

/**
 * Upload payment proof (for bank transfer and Binance payments)
 * POST /api/payments/:paymentId/upload-proof
 */
router.post("/:paymentId/upload-proof", protect, upload.single('proof'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;
    const {
      binanceNickname,
      transferAmount,
      transferCurrency,
      binanceTransactionId,
      binanceSenderUserId,
      // Bank transfer fields
      isOwnBankAccount,
      thirdPartyAccountHolder,
      senderBankName
    } = req.body;

    if (!req.file) {
      res.status(400).json({ success: false, message: "No se subió ningún archivo" });
      return;
    }

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Verify user is the payer
    if (payment.payerId !== userId) {
      res.status(403).json({ success: false, message: "No autorizado" });
      return;
    }

    // Deactivate previous proofs for this payment
    await PaymentProof.update(
      { isActive: false },
      { where: { paymentId, isActive: true } }
    );

    // Create new payment proof
    const proof = await PaymentProof.create({
      paymentId,
      userId,
      fileUrl: `/uploads/payment-proofs/${req.file.filename}`,
      fileType: path.extname(req.file.originalname).slice(1).toLowerCase() as any,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      binanceNickname: binanceNickname || null,
      binanceTransactionId: binanceTransactionId || null,
      binanceSenderUserId: binanceSenderUserId || null,
      transferAmount: transferAmount || null,
      transferCurrency: transferCurrency || null,
      // Bank transfer fields
      isOwnBankAccount: isOwnBankAccount === 'true' || isOwnBankAccount === true,
      thirdPartyAccountHolder: thirdPartyAccountHolder || null,
      senderBankName: senderBankName || null,
      status: 'pending',
      uploadedAt: new Date(),
      isActive: true,
    });

    // Update payment status to pending verification
    payment.status = 'pending_verification';
    await payment.save();

    // Update job status if this is a job publication payment
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'pending_approval'; // Waiting for admin to verify payment proof
        await job.save();
      }
    }

    // Update job status if this is a budget increase payment
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        // Keep job paused but mark payment as pending verification
        // Job will be reactivated when admin approves the payment
        console.log(`Budget increase payment proof uploaded for job ${job.id}, waiting for admin approval`);
      }
    }

    // Notify admins about new payment proof
    const adminUsers = await User.findAll({
      where: {
        [Op.or]: [
          { role: 'admin' },
          { role: 'super_admin' },
          { role: 'owner' }
        ]
      }
    });

    for (const admin of adminUsers) {
      await Notification.create({
        userId: admin.id,
        title: 'Nuevo comprobante de pago',
        message: `Usuario ${req.user.username} subió un comprobante para el pago ${paymentId}`,
        type: 'payment',
        relatedId: paymentId,
        relatedType: 'Payment',
      });
    }

    res.json({
      success: true,
      message: "Comprobante subido exitosamente. Será verificado por un administrador.",
      proof: {
        id: proof.id,
        fileUrl: proof.fileUrl,
        fileName: proof.fileName,
        status: proof.status,
        uploadedAt: proof.uploadedAt,
      }
    });
  } catch (error: any) {
    console.error("Upload payment proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error subiendo comprobante" });
  }
});

/**
 * Get payment proofs for a payment
 * GET /api/payments/:paymentId/proofs
 */
router.get("/:paymentId/proofs", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Verify user is involved in the payment or is admin
    const isAdmin = ['admin', 'super_admin', 'owner'].includes(req.user.role);
    if (payment.payerId !== userId && payment.recipientId !== userId && !isAdmin) {
      res.status(403).json({ success: false, message: "No autorizado" });
      return;
    }

    // Get all proofs for this payment
    const proofs = await PaymentProof.findAll({
      where: { paymentId },
      order: [['uploadedAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: User, as: 'verifier', attributes: ['id', 'username', 'email'] }
      ]
    });

    res.json({
      success: true,
      proofs
    });
  } catch (error: any) {
    console.error("Get payment proofs error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo comprobantes" });
  }
});

/**
 * Get currency conversion rates (ARS to USDT)
 * GET /api/payments/conversion/usdt
 */
router.get("/conversion/usdt", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.query;

    if (!amount || isNaN(Number(amount))) {
      res.status(400).json({ success: false, message: "Debe proporcionar un monto válido" });
      return;
    }

    const amountARS = Number(amount);
    const rate = await currencyExchange.getARStoUSDTRate();
    const amountUSDT = await currencyExchange.convertARStoUSDT(amountARS);

    res.json({
      success: true,
      conversion: {
        amountARS,
        amountUSDT,
        rate,
        timestamp: new Date(),
      },
      binanceInfo: {
        binanceId: process.env.BINANCE_ID || null,
        binanceNickname: process.env.BINANCE_NICKNAME || null,
      }
    });
  } catch (error: any) {
    console.error("Get conversion error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo conversión" });
  }
});

/**
 * Get latest active payment proof for a payment
 * GET /api/payments/:paymentId/proof
 */
router.get("/:paymentId/proof", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Verify user is involved in the payment or is admin
    const isAdmin = ['admin', 'super_admin', 'owner'].includes(req.user.role);
    if (payment.payerId !== userId && payment.recipientId !== userId && !isAdmin) {
      res.status(403).json({ success: false, message: "No autorizado" });
      return;
    }

    // Get latest active proof
    const proof = await PaymentProof.findOne({
      where: { paymentId, isActive: true },
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: User, as: 'verifier', attributes: ['id', 'username', 'email'] }
      ]
    });

    if (!proof) {
      res.status(404).json({ success: false, message: "No se encontró comprobante" });
      return;
    }

    res.json({
      success: true,
      proof
    });
  } catch (error: any) {
    console.error("Get payment proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo comprobante" });
  }
});

/**
 * Approve payment proof (admin only)
 * POST /api/payments/:paymentId/proof/:proofId/approve
 */
router.post("/:paymentId/proof/:proofId/approve", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, proofId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;

    // Find the payment proof
    const proof = await PaymentProof.findOne({
      where: { id: proofId, paymentId, isActive: true }
    });

    if (!proof) {
      res.status(404).json({ success: false, message: "Comprobante no encontrado" });
      return;
    }

    if (proof.status !== 'pending') {
      res.status(400).json({ success: false, message: "Este comprobante ya fue procesado" });
      return;
    }

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Update proof status
    proof.status = 'approved';
    proof.verifiedBy = adminId;
    proof.verifiedAt = new Date();
    if (notes) proof.notes = notes;
    await proof.save();

    // Update payment status to approved
    payment.status = 'approved';
    await payment.save();

    // If this is a job publication payment, publish the job
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'open';
        job.publicationPaid = true;
        await job.save();

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Pago aprobado',
          message: `Tu pago para publicar "${job.title}" fue aprobado. ¡El trabajo está ahora publicado!`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });

        // Real-time notification
        socketService.notifyJobStatusChanged(job.toJSON(), 'pending_payment');
      }
    }

    // If this is a budget increase payment, apply the new price and reactivate the job
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job && job.pendingNewPrice) {
        const oldPrice = Number(job.price);
        const newPrice = Number(job.pendingNewPrice);
        const previousStatus = job.previousStatus || 'open';

        // Agregar al historial de cambios
        const priceHistory = job.priceHistory || [];
        priceHistory.push({
          oldPrice,
          newPrice,
          reason: job.priceChangeReason || 'Aumento de presupuesto',
          changedAt: new Date(),
        });

        // Aplicar el nuevo precio y reactivar el trabajo
        await job.update({
          price: newPrice,
          priceChangedAt: new Date(),
          priceHistory,
          pendingNewPrice: null,
          pendingPaymentAmount: 0,
          previousStatus: null,
          status: previousStatus,
        });

        console.log(`✅ [APPROVE] Budget increase applied: $${oldPrice} -> $${newPrice} for job ${job.id}`);

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Presupuesto actualizado',
          message: `Tu pago fue aprobado. El presupuesto de "${job.title}" ha sido actualizado a $${newPrice.toLocaleString('es-AR')} ARS. El trabajo ha sido reactivado.`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });

        // Real-time notification
        socketService.notifyJobStatusChanged(job.toJSON(), 'paused');
      }
    }

    // Notify user
    await Notification.create({
      userId: payment.payerId,
      title: 'Comprobante aprobado',
      message: 'Tu comprobante de pago fue verificado y aprobado.',
      type: 'payment',
      relatedId: paymentId,
      relatedType: 'Payment',
    });

    res.json({
      success: true,
      message: "Comprobante aprobado exitosamente",
      proof: {
        id: proof.id,
        status: proof.status,
        verifiedAt: proof.verifiedAt,
      }
    });
  } catch (error: any) {
    console.error("Approve proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error aprobando comprobante" });
  }
});

/**
 * Reject payment proof (admin only)
 * POST /api/payments/:paymentId/proof/:proofId/reject
 */
router.post("/:paymentId/proof/:proofId/reject", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, proofId } = req.params;
    const { reason, notes } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      res.status(400).json({ success: false, message: "Debe proporcionar un motivo de rechazo" });
      return;
    }

    // Find the payment proof
    const proof = await PaymentProof.findOne({
      where: { id: proofId, paymentId, isActive: true }
    });

    if (!proof) {
      res.status(404).json({ success: false, message: "Comprobante no encontrado" });
      return;
    }

    if (proof.status !== 'pending') {
      res.status(400).json({ success: false, message: "Este comprobante ya fue procesado" });
      return;
    }

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Update proof status
    proof.status = 'rejected';
    proof.verifiedBy = adminId;
    proof.verifiedAt = new Date();
    proof.rejectionReason = reason;
    if (notes) proof.notes = notes;
    await proof.save();

    // Update payment status back to pending_verification so user can upload a new proof
    payment.status = 'pending_verification';
    await payment.save();

    // If this is a job publication payment, keep job in pending_payment status
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'pending_payment'; // User needs to upload a new proof
        await job.save();

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Comprobante rechazado',
          message: `Tu comprobante de pago para "${job.title}" fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });
      }
    }

    // If this is a budget increase payment, keep job paused waiting for new proof
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        // Job stays paused, user needs to upload a new proof
        // Don't clear pendingNewPrice yet - they might upload a valid proof

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Comprobante rechazado',
          message: `Tu comprobante de pago para el aumento de presupuesto de "${job.title}" fue rechazado. Motivo: ${reason}. El trabajo permanece pausado. Por favor, sube un nuevo comprobante o cancela el cambio de presupuesto.`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });
      }
    }

    // Notify user
    await Notification.create({
      userId: payment.payerId,
      title: 'Comprobante rechazado',
      message: `Tu comprobante de pago fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
      type: 'payment',
      relatedId: paymentId,
      relatedType: 'Payment',
    });

    res.json({
      success: true,
      message: "Comprobante rechazado",
      proof: {
        id: proof.id,
        status: proof.status,
        rejectionReason: proof.rejectionReason,
        verifiedAt: proof.verifiedAt,
      }
    });
  } catch (error: any) {
    console.error("Reject proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error rechazando comprobante" });
  }
});

/**
 * Get all pending payment proofs (admin only)
 * GET /api/payments/proofs/pending
 */
router.get("/proofs/pending", protect, requireRole('admin', 'super_admin', 'owner', 'support'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proofs = await PaymentProof.findAll({
      where: {
        status: 'pending',
        isActive: true,
      },
      include: [
        {
          model: Payment,
          as: 'payment',
          attributes: ['id', 'amount', 'currency', 'paymentType', 'paymentMethod', 'status', 'createdAt'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName'],
        }
      ],
      order: [['uploadedAt', 'ASC']],
    });

    res.json({
      success: true,
      count: proofs.length,
      proofs
    });
  } catch (error: any) {
    console.error("Get pending proofs error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo comprobantes pendientes" });
  }
});

export default router;
