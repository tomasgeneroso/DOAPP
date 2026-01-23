import { Router, Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { PaymentProof } from "../../models/sql/PaymentProof.model.js";
import { User } from "../../models/sql/User.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Notification } from "../../models/sql/Notification.model.js";
import { Op } from 'sequelize';
import { isValidUUID } from "../../utils/sanitizer.js";

const router = Router();

/**
 * Get all payments pending verification (admin only)
 * GET /api/admin/payments/pending
 * Muestra TODOS los pagos pendientes: MercadoPago y transferencias bancarias
 */
router.get("/pending", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      status,
      paymentType,
      limit = '50',
      offset = '0',
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const where: any = {};

    // Filter by status
    if (status) {
      where.status = status;
    } else {
      // Default: show pending_verification payments
      where.status = {
        [Op.in]: ['pending_verification', 'pending']
      };
    }

    // Filter by payment type
    if (paymentType) {
      where.paymentType = paymentType;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt[Op.gte] = new Date(dateFrom as string);
      }
      if (dateTo) {
        // Add 1 day to include the end date
        const endDate = new Date(dateTo as string);
        endDate.setDate(endDate.getDate() + 1);
        where.createdAt[Op.lt] = endDate;
      }
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      where.amount = {};
      if (minAmount) {
        where.amount[Op.gte] = parseFloat(minAmount as string);
      }
      if (maxAmount) {
        where.amount[Op.lte] = parseFloat(maxAmount as string);
      }
    }

    // Determine sort field and order
    const validSortFields = ['createdAt', 'amount', 'status'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const orderDirection = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const payments = await Payment.findAll({
      where,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      order: [[sortField, orderDirection]],
      include: [
        {
          model: User,
          as: 'payer',
          attributes: ['id', 'username', 'email', 'name', 'phone', 'dni', 'address', 'bankingInfo']
        },
        {
          model: User,
          as: 'recipient',
          attributes: ['id', 'username', 'email', 'name', 'phone', 'dni', 'address', 'bankingInfo']
        },
        {
          model: Contract,
          as: 'contract',
          required: false,
          attributes: ['id', 'status', 'price', 'allocatedAmount', 'clientId', 'doerId', 'jobId', 'clientConfirmed', 'doerConfirmed', 'commission', 'escrowStatus', 'paymentStatus'],
          include: [
            {
              model: Job,
              as: 'job',
              attributes: ['id', 'title', 'description', 'category']
            },
            {
              model: User,
              as: 'client',
              attributes: ['id', 'name', 'email', 'phone', 'bankingInfo']
            },
            {
              model: User,
              as: 'doer',
              attributes: ['id', 'name', 'email', 'phone', 'dni', 'address', 'bankingInfo']
            }
          ]
        },
        {
          model: PaymentProof,
          as: 'proofs',
          where: { isActive: true },
          required: false,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'email']
            }
          ]
        }
      ]
    });

    // Get related jobs for job publication and budget increase payments
    const paymentsWithJobs = await Promise.all(payments.map(async (payment) => {
      const paymentObj = payment.toJSON();

      // Handle job_publication and budget_increase payments
      if (payment.paymentType === 'job_publication' || payment.paymentType === 'budget_increase') {
        const job = await Job.findOne({
          where: { publicationPaymentId: payment.id },
          attributes: ['id', 'title', 'status', 'price', 'category', 'pendingNewPrice', 'pendingPaymentAmount', 'priceChangeReason', 'clientId'],
          include: [
            {
              model: User,
              as: 'client',
              attributes: ['id', 'name', 'email', 'phone', 'bankingInfo']
            }
          ]
        });

        return {
          ...paymentObj,
          job: job?.toJSON(),
          // Información clave para el admin
          paymentMethod: payment.mercadopagoPaymentId ? 'MercadoPago' : 'Transferencia Bancaria',
          hasProof: paymentObj.proofs && paymentObj.proofs.length > 0,
          isMercadoPago: !!payment.mercadopagoPaymentId,
          displayInfo: {
            title: job?.title || 'Publicación de trabajo',
            type: payment.paymentType,
            amount: payment.amount,
            payer: paymentObj.payer,
            status: payment.status,
            createdAt: payment.createdAt,
            mercadopagoId: payment.mercadopagoPaymentId
          }
        };
      }

      // Contract payments already have the contract included
      if (payment.contractId) {
        return {
          ...paymentObj,
          // Información clave para el admin
          paymentMethod: payment.mercadopagoPaymentId ? 'MercadoPago' : 'Transferencia Bancaria',
          hasProof: paymentObj.proofs && paymentObj.proofs.length > 0,
          isMercadoPago: !!payment.mercadopagoPaymentId,
          displayInfo: {
            title: paymentObj.contract?.job?.title || 'Contrato',
            type: payment.paymentType,
            amount: payment.amount,
            payer: paymentObj.payer,
            recipient: paymentObj.recipient,
            contract: paymentObj.contract,
            status: payment.status,
            createdAt: payment.createdAt,
            mercadopagoId: payment.mercadopagoPaymentId
          }
        };
      }

      return {
        ...paymentObj,
        paymentMethod: payment.mercadopagoPaymentId ? 'MercadoPago' : 'Transferencia Bancaria',
        hasProof: paymentObj.proofs && paymentObj.proofs.length > 0,
        isMercadoPago: !!payment.mercadopagoPaymentId
      };
    }));

    const total = await Payment.count({ where });

    res.json({
      success: true,
      data: paymentsWithJobs,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error: any) {
    console.error("Get pending payments error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo pagos pendientes" });
  }
});

/**
 * Get payment details with proof (admin only)
 * GET /api/admin/payments/:paymentId
 */
router.get("/:paymentId", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(paymentId)) {
      res.status(400).json({ success: false, message: "ID de pago inválido" });
      return;
    }

    const payment = await Payment.findByPk(paymentId, {
      include: [
        {
          model: User,
          as: 'payer',
          attributes: ['id', 'username', 'email', 'name', 'phone', 'dni', 'address', 'bankingInfo']
        },
        {
          model: User,
          as: 'recipient',
          attributes: ['id', 'username', 'email', 'name', 'phone', 'dni', 'address', 'bankingInfo']
        },
        {
          model: Contract,
          as: 'contract',
          required: false,
          include: [
            {
              model: Job,
              as: 'job',
              attributes: ['id', 'title', 'description', 'category', 'price']
            },
            {
              model: User,
              as: 'client',
              attributes: ['id', 'name', 'email', 'phone', 'bankingInfo']
            },
            {
              model: User,
              as: 'doer',
              attributes: ['id', 'name', 'email', 'phone', 'dni', 'address', 'bankingInfo']
            }
          ]
        },
        {
          model: PaymentProof,
          as: 'proofs',
          order: [['uploadedAt', 'DESC']],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'email']
            },
            {
              model: User,
              as: 'verifier',
              attributes: ['id', 'username', 'email']
            }
          ]
        }
      ]
    });

    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    const paymentData = payment.toJSON();

    // Get related job if job publication or budget increase payment
    if (payment.paymentType === 'job_publication' || payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email', 'phone', 'bankingInfo']
          }
        ]
      });

      if (job) {
        paymentData.job = job.toJSON();
      }
    }

    // Add payment method info
    paymentData.paymentMethod = payment.mercadopagoPaymentId ? 'MercadoPago' : 'Transferencia Bancaria';
    paymentData.isMercadoPago = !!payment.mercadopagoPaymentId;
    paymentData.hasProof = paymentData.proofs && paymentData.proofs.length > 0;

    // Add summary info for admin
    paymentData.adminSummary = {
      requiresAction: payment.status === 'pending_verification' || payment.status === 'pending',
      paymentMethod: payment.mercadopagoPaymentId ? 'MercadoPago' : 'Transferencia Bancaria',
      mercadopagoId: payment.mercadopagoPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      type: payment.paymentType,
      status: payment.status,
      createdAt: payment.createdAt,
      payer: {
        id: paymentData.payer?.id,
        name: paymentData.payer?.name,
        email: paymentData.payer?.email,
        phone: paymentData.payer?.phone,
        bankingInfo: paymentData.payer?.bankingInfo
      },
      recipient: paymentData.recipient ? {
        id: paymentData.recipient?.id,
        name: paymentData.recipient?.name,
        email: paymentData.recipient?.email,
        phone: paymentData.recipient?.phone,
        dni: paymentData.recipient?.dni,
        address: paymentData.recipient?.address,
        bankingInfo: paymentData.recipient?.bankingInfo
      } : null
    };

    res.json({
      success: true,
      data: paymentData
    });
  } catch (error: any) {
    console.error("Get payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo pago" });
  }
});

/**
 * Approve payment proof OR MercadoPago payment (admin only)
 * POST /api/admin/payments/:paymentId/approve
 */
router.post("/:paymentId/approve", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { notes, proofId } = req.body;
    const adminId = req.user.id;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(paymentId)) {
      res.status(400).json({ success: false, message: "ID de pago inválido" });
      return;
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Check if there's a proof to verify (only for bank transfers with uploaded proofs)
    let proof = null;
    if (proofId) {
      proof = await PaymentProof.findOne({
        where: { id: proofId, paymentId, isActive: true }
      });
    } else {
      // Try to find an active pending proof
      proof = await PaymentProof.findOne({
        where: { paymentId, isActive: true, status: 'pending' }
      });
    }

    // If proof exists, verify it
    if (proof) {
      if (proof.status !== 'pending') {
        res.status(400).json({ success: false, message: "Este comprobante ya fue procesado" });
        return;
      }

      // Update proof
      proof.status = 'approved';
      proof.verifiedBy = adminId;
      proof.verifiedAt = new Date();
      if (notes) proof.notes = notes;
      await proof.save();
    }
    // If no proof exists, that's OK - we can still approve the payment directly
    // This handles MercadoPago payments and migrated payments without proofs

    // Determine the correct status based on payment type
    // For contract payments: go to "verified" first (two-step verification)
    //   Step 1: pending_verification → verified (proof verified)
    //   Step 2: verified → held_escrow (escrow confirmed by admin)
    // For other payments (job_publication, etc.): go to completed
    const isContractPayment = payment.paymentType === 'contract_payment' || payment.paymentType === 'escrow_deposit';
    const newStatus = isContractPayment ? 'verified' : 'completed';

    // Update payment
    payment.status = newStatus;
    payment.approvedBy = adminId;
    payment.approvedAt = new Date();
    if (notes) {
      payment.adminNotes = notes;
    }
    await payment.save();

    console.log(`✅ [ADMIN APPROVE] Payment ${paymentId} approved with status: ${newStatus}`);

    // Handle job publication payment
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
          recipientId: job.clientId,
          title: 'Pago aprobado',
          message: `Tu pago para publicar "${job.title}" fue aprobado. ¡El trabajo está ahora publicado!`,
          type: 'success',
          category: 'payment',
          relatedId: job.id,
          relatedModel: 'Job',
        });
      }
    }

    // Handle budget increase payment
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

        console.log(`✅ [ADMIN APPROVE] Budget increase applied: $${oldPrice} -> $${newPrice} for job ${job.id}`);

        // Notify job owner
        await Notification.create({
          recipientId: job.clientId,
          title: 'Presupuesto actualizado',
          message: `Tu pago fue aprobado. El presupuesto de "${job.title}" ha sido actualizado a $${newPrice.toLocaleString('es-AR')} ARS. El trabajo ha sido reactivado.`,
          type: 'success',
          category: 'payment',
          relatedId: job.id,
          relatedModel: 'Job',
        });
      }
    }

    // Handle contract payment verification (first step - proof verification only)
    // This step only verifies the proof but does NOT move to escrow yet
    // Admin must use verify-escrow endpoint to complete the escrow step
    if (payment.paymentType === 'contract_payment' || payment.paymentType === 'escrow_deposit') {
      const contract = await Contract.findByPk(payment.contractId, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
          { model: Job, as: 'job', attributes: ['id', 'title'] }
        ]
      });

      if (contract) {
        const job = contract.job as any;
        const jobTitle = job?.title || 'Contrato';

        console.log(`✅ [ADMIN APPROVE] Payment ${paymentId} verified (Step 1). Awaiting escrow confirmation (Step 2).`);

        // Notify both parties about proof verification (not escrow yet)
        await Promise.all([
          Notification.create({
            recipientId: contract.clientId,
            type: 'info',
            category: 'payment',
            title: 'Comprobante verificado',
            message: `Tu comprobante de pago de $${payment.amount} para "${jobTitle}" fue verificado. Pendiente confirmación de escrow.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            sentVia: ['in_app'],
          }),
          Notification.create({
            recipientId: contract.doerId,
            type: 'info',
            category: 'contract',
            title: 'Comprobante verificado',
            message: `El comprobante de pago de $${payment.amount} para "${jobTitle}" fue verificado. Pendiente confirmación de escrow.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            sentVia: ['in_app'],
          })
        ]);
      }
    }

    // Notify user
    const hasMercadoPagoId = !!payment.mercadopagoPaymentId;
    await Notification.create({
      recipientId: payment.payerId,
      title: hasMercadoPagoId ? 'Pago de MercadoPago aprobado' : 'Pago aprobado',
      message: hasMercadoPagoId
        ? 'Tu pago de MercadoPago fue verificado y aprobado por un administrador.'
        : 'Tu pago fue verificado y aprobado por un administrador.',
      type: 'success',
      category: 'payment',
      relatedId: paymentId,
      relatedModel: 'Payment',
    });

    res.json({
      success: true,
      message: "Pago aprobado exitosamente",
      data: {
        payment: payment.toJSON(),
        proof: proof?.toJSON()
      }
    });
  } catch (error: any) {
    console.error("Approve payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error aprobando pago" });
  }
});

/**
 * Reject payment (admin only)
 * POST /api/admin/payments/:paymentId/reject
 *
 * Allows rejecting a payment with or without a proof.
 * - If proof exists, it will be marked as rejected
 * - Payment will be marked as rejected regardless
 */
router.post("/:paymentId/reject", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { reason, notes, proofId } = req.body;
    const adminId = req.user.id;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(paymentId)) {
      res.status(400).json({ success: false, message: "ID de pago inválido" });
      return;
    }

    if (!reason) {
      res.status(400).json({ success: false, message: "Debe proporcionar un motivo de rechazo" });
      return;
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Find active proof (optional - payment can be rejected without proof)
    let proof = null;
    if (proofId) {
      proof = await PaymentProof.findOne({
        where: { id: proofId, paymentId, isActive: true }
      });
    } else {
      // Try to find any active pending proof
      proof = await PaymentProof.findOne({
        where: { paymentId, isActive: true, status: 'pending' }
      });
    }

    // If proof exists and is pending, mark it as rejected
    if (proof && proof.status === 'pending') {
      proof.status = 'rejected';
      proof.verifiedBy = adminId;
      proof.verifiedAt = new Date();
      proof.rejectionReason = reason;
      if (notes) proof.notes = notes;
      await proof.save();
      console.log(`[ADMIN REJECT] Proof ${proof.id} rejected for payment ${paymentId}`);
    }

    // Update payment status to rejected
    payment.status = 'rejected';
    payment.adminNotes = `[Rechazado] ${reason}${notes ? `\nNotas: ${notes}` : ''}`;
    await payment.save();

    console.log(`[ADMIN REJECT] Payment ${paymentId} rejected. Reason: ${reason}`);

    // If job publication payment, set job back to pending_payment
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'pending_payment';
        await job.save();

        // Notify job owner
        await Notification.create({
          recipientId: job.clientId,
          title: 'Comprobante rechazado',
          message: `El comprobante de pago para "${job.title}" fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
          type: 'warning',
          category: 'payment',
          relatedId: job.id,
          relatedModel: 'Job',
        });
      }
    }

    // If budget increase payment, keep job paused but allow new proof upload
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        // Job stays paused, user can upload a new proof
        console.log(`⚠️ [ADMIN REJECT] Budget increase proof rejected for job ${job.id}, waiting for new proof`);

        // Notify job owner
        await Notification.create({
          recipientId: job.clientId,
          title: 'Comprobante rechazado',
          message: `El comprobante de pago para el aumento de presupuesto de "${job.title}" fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
          type: 'warning',
          category: 'payment',
          relatedId: job.id,
          relatedModel: 'Job',
        });
      }
    }

    // Handle contract payments
    if (payment.paymentType === 'contract_payment' || payment.paymentType === 'escrow_deposit') {
      const contract = await Contract.findByPk(payment.contractId, {
        include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }]
      });

      if (contract) {
        // Update contract status
        contract.paymentStatus = 'failed';
        await contract.save();

        const job = contract.job as any;
        const jobTitle = job?.title || 'Contrato';

        // Notify both parties
        await Promise.all([
          Notification.create({
            recipientId: contract.clientId,
            type: 'warning',
            category: 'payment',
            title: 'Pago rechazado',
            message: `El pago para "${jobTitle}" fue rechazado. Motivo: ${reason}. Por favor, realiza un nuevo pago.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            sentVia: ['in_app', 'push'],
          }),
          Notification.create({
            recipientId: contract.doerId,
            type: 'warning',
            category: 'contract',
            title: 'Pago rechazado',
            message: `El pago del cliente para "${jobTitle}" fue rechazado. El contrato está pendiente de pago.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            sentVia: ['in_app'],
          })
        ]);
      }
    }

    // Notify user (for non-contract payments)
    if (payment.paymentType !== 'contract_payment' && payment.paymentType !== 'escrow_deposit') {
      await Notification.create({
        recipientId: payment.payerId,
        title: 'Pago rechazado',
        message: `Tu pago fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante o realiza el pago nuevamente.`,
        type: 'warning',
        category: 'payment',
        relatedId: paymentId,
        relatedModel: 'Payment',
      });
    }

    res.json({
      success: true,
      message: "Pago rechazado exitosamente",
      data: {
        payment: payment.toJSON(),
        proof: proof?.toJSON() || null
      }
    });
  } catch (error: any) {
    console.error("Reject payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error rechazando pago" });
  }
});

/**
 * Verify Escrow - Second step of payment verification (admin only)
 * Moves payment from 'verified' to 'held_escrow' and updates contract
 * POST /api/admin/payments/:paymentId/verify-escrow
 */
router.post("/:paymentId/verify-escrow", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(paymentId)) {
      res.status(400).json({ success: false, message: "ID de pago inválido" });
      return;
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Only allow verify-escrow from 'verified' status
    if (payment.status !== 'verified') {
      res.status(400).json({
        success: false,
        message: `No se puede verificar escrow para un pago con estado "${payment.status}". El pago debe estar en estado "verified".`
      });
      return;
    }

    // Only for contract payments
    if (payment.paymentType !== 'contract_payment' && payment.paymentType !== 'escrow_deposit') {
      res.status(400).json({
        success: false,
        message: "Solo se puede verificar escrow para pagos de contrato"
      });
      return;
    }

    // Update payment to held_escrow
    payment.status = 'held_escrow';
    payment.escrowVerifiedBy = adminId;
    payment.escrowVerifiedAt = new Date();
    if (notes) {
      payment.adminNotes = (payment.adminNotes || '') + `\n[Escrow] ${notes}`;
    }
    await payment.save();

    console.log(`✅ [ADMIN VERIFY-ESCROW] Payment ${paymentId} moved to held_escrow`);

    // Now update the contract
    const contract = await Contract.findByPk(payment.contractId, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] }
      ]
    });

    if (contract) {
      const job = contract.job as any;
      const jobTitle = job?.title || 'Contrato';

      // Update contract escrow status
      contract.escrowStatus = 'held_escrow';
      contract.paymentDate = new Date();

      // Determine the correct payment status based on contract state
      if (contract.clientConfirmed && contract.doerConfirmed) {
        // Both confirmed - ready for worker payout
        contract.paymentStatus = 'pending_payout';
      } else if (contract.status === 'completed' || contract.status === 'awaiting_confirmation') {
        // Contract completed but waiting for confirmations
        contract.paymentStatus = 'escrow';
      } else {
        // Contract not yet started - set to escrow and allow to start
        contract.paymentStatus = 'escrow';
        if (contract.status === 'pending' || contract.status === 'ready' || contract.status === 'accepted') {
          contract.status = 'in_progress';
        }
      }

      await contract.save();

      console.log(`✅ [ADMIN VERIFY-ESCROW] Contract ${contract.id}: escrowStatus=${contract.escrowStatus}, paymentStatus=${contract.paymentStatus}, status=${contract.status}`);

      // Determine notification message based on contract state
      let clientMessage: string;
      let workerMessage: string;

      if (contract.clientConfirmed && contract.doerConfirmed) {
        clientMessage = `Tu pago de $${payment.amount} para "${jobTitle}" está en escrow. El pago al trabajador está listo para procesarse.`;
        workerMessage = `El pago de $${payment.amount} para "${jobTitle}" está en escrow. Pronto recibirás tu pago.`;
      } else {
        clientMessage = `Tu pago de $${payment.amount} para "${jobTitle}" está asegurado en escrow.`;
        workerMessage = `El pago de $${payment.amount} para "${jobTitle}" está asegurado en escrow. ¡Puedes comenzar a trabajar!`;
      }

      // Notify both parties
      await Promise.all([
        Notification.create({
          recipientId: contract.clientId,
          type: 'success',
          category: 'payment',
          title: 'Pago en Escrow',
          message: clientMessage,
          relatedModel: 'Contract',
          relatedId: contract.id,
          sentVia: ['in_app', 'push'],
        }),
        Notification.create({
          recipientId: contract.doerId,
          type: 'success',
          category: 'contract',
          title: 'Pago en Escrow',
          message: workerMessage,
          relatedModel: 'Contract',
          relatedId: contract.id,
          sentVia: ['in_app', 'push'],
        })
      ]);
    }

    res.json({
      success: true,
      message: "Pago verificado y movido a escrow exitosamente",
      data: {
        payment: payment.toJSON(),
        contract: contract?.toJSON()
      }
    });
  } catch (error: any) {
    console.error("Verify escrow error:", error);
    res.status(500).json({ success: false, message: error.message || "Error verificando escrow" });
  }
});

/**
 * Confirm for Worker Payout - Move from held_escrow to pending_payout (admin only)
 * This endpoint is used when the admin confirms that the escrow funds should be
 * released for worker payment (to appear in "Pagos a Trabajadores - Pendiente")
 * POST /api/admin/payments/:paymentId/confirm-for-payout
 */
router.post("/:paymentId/confirm-for-payout", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(paymentId)) {
      res.status(400).json({ success: false, message: "ID de pago inválido" });
      return;
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Only allow from 'held_escrow' status
    if (payment.status !== 'held_escrow') {
      res.status(400).json({
        success: false,
        message: `No se puede confirmar para pago un pago con estado "${payment.status}". El pago debe estar en estado "held_escrow".`
      });
      return;
    }

    // Only for contract payments
    if (payment.paymentType !== 'contract_payment' && payment.paymentType !== 'escrow_deposit') {
      res.status(400).json({
        success: false,
        message: "Solo se puede confirmar para pago los pagos de contrato"
      });
      return;
    }

    // Update payment to confirmed_for_payout (ready for worker payout)
    payment.status = 'confirmed_for_payout';
    if (notes) {
      payment.adminNotes = (payment.adminNotes || '') + `\n[Confirmado para pago] ${notes}`;
    }
    await payment.save();

    console.log(`✅ [ADMIN CONFIRM-FOR-PAYOUT] Payment ${paymentId} moved to confirmed_for_payout`);

    // Now update the contract
    const contract = await Contract.findByPk(payment.contractId, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] }
      ]
    });

    if (contract) {
      const job = contract.job as any;
      const jobTitle = job?.title || 'Contrato';

      // Update contract payment status to pending_payout
      contract.paymentStatus = 'pending_payout';
      await contract.save();

      console.log(`✅ [ADMIN CONFIRM-FOR-PAYOUT] Contract ${contract.id}: paymentStatus=${contract.paymentStatus}`);

      // Notify worker that payment is ready to be processed
      await Notification.create({
        recipientId: contract.doerId,
        type: 'success',
        category: 'payment',
        title: 'Pago en proceso',
        message: `El pago de $${payment.amount} para "${jobTitle}" está siendo procesado. Pronto recibirás el dinero en tu cuenta.`,
        relatedModel: 'Contract',
        relatedId: contract.id,
        sentVia: ['in_app', 'push'],
      });
    }

    res.json({
      success: true,
      message: "Pago confirmado para procesamiento. Ahora aparece en 'Pagos a Trabajadores - Pendiente'.",
      data: {
        payment: payment.toJSON(),
        contract: contract?.toJSON()
      }
    });
  } catch (error: any) {
    console.error("Confirm for payout error:", error);
    res.status(500).json({ success: false, message: error.message || "Error confirmando pago" });
  }
});

/**
 * Cancel payment rejection - reverts payment to pending_verification (admin only)
 * POST /api/admin/payments/:paymentId/cancel-reject
 */
router.post("/:paymentId/cancel-reject", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(paymentId)) {
      res.status(400).json({ success: false, message: "ID de pago inválido" });
      return;
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Only allow cancel-reject from 'rejected' status
    if (payment.status !== 'rejected') {
      res.status(400).json({
        success: false,
        message: `No se puede cancelar el rechazo de un pago con estado "${payment.status}". El pago debe estar en estado "rejected".`
      });
      return;
    }

    // Revert payment to pending_verification
    payment.status = 'pending_verification';
    payment.adminNotes = (payment.adminNotes || '') + `\n[Rechazo cancelado] ${notes || 'Revertido a pendiente de verificación'}`;
    await payment.save();

    console.log(`✅ [ADMIN CANCEL-REJECT] Payment ${paymentId} reverted to pending_verification`);

    // If there are rejected proofs, revert them to pending
    const rejectedProofs = await PaymentProof.findAll({
      where: { paymentId, status: 'rejected' }
    });

    for (const proof of rejectedProofs) {
      proof.status = 'pending';
      proof.verifiedBy = null;
      proof.verifiedAt = null;
      proof.rejectionReason = null;
      await proof.save();
      console.log(`[ADMIN CANCEL-REJECT] Proof ${proof.id} reverted to pending`);
    }

    // Handle contract payments - revert contract status if needed
    if (payment.paymentType === 'contract_payment' || payment.paymentType === 'escrow_deposit') {
      const contract = await Contract.findByPk(payment.contractId, {
        include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }]
      });

      if (contract && contract.paymentStatus === 'failed') {
        contract.paymentStatus = 'pending';
        await contract.save();
        console.log(`[ADMIN CANCEL-REJECT] Contract ${contract.id} payment status reverted to pending`);
      }
    }

    // Handle job publication payment - revert job status
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job && job.status === 'pending_payment') {
        // Job stays in pending_payment - user can upload a new proof
        console.log(`[ADMIN CANCEL-REJECT] Job ${job.id} remains in pending_payment for new proof upload`);
      }
    }

    // Notify user that their payment can be retried
    await Notification.create({
      recipientId: payment.payerId,
      title: 'Rechazo de pago cancelado',
      message: 'El rechazo de tu pago fue cancelado por un administrador. Puedes subir un nuevo comprobante o el pago será revisado nuevamente.',
      type: 'info',
      category: 'payment',
      relatedId: paymentId,
      relatedModel: 'Payment',
    });

    res.json({
      success: true,
      message: "Rechazo cancelado. El pago volvió a estado 'pendiente de verificación'.",
      data: {
        payment: payment.toJSON(),
        proofsReverted: rejectedProofs.length
      }
    });
  } catch (error: any) {
    console.error("Cancel reject error:", error);
    res.status(500).json({ success: false, message: error.message || "Error cancelando rechazo" });
  }
});

export default router;
