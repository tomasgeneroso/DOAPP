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

const router = Router();

/**
 * Get all payments pending verification (admin only)
 * GET /api/admin/payments/pending
 */
router.get("/pending", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, paymentType, limit = '50', offset = '0' } = req.query;

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

    const payments = await Payment.findAll({
      where,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'payer',
          attributes: ['id', 'username', 'email', 'name']
        },
        {
          model: User,
          as: 'recipient',
          attributes: ['id', 'username', 'email', 'name']
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

    // Get related jobs for job publication payments
    const paymentsWithJobs = await Promise.all(payments.map(async (payment) => {
      const paymentObj = payment.toJSON();

      if (payment.paymentType === 'job_publication') {
        const job = await Job.findOne({
          where: { publicationPaymentId: payment.id },
          attributes: ['id', 'title', 'status', 'price', 'category']
        });

        return {
          ...paymentObj,
          job: job?.toJSON()
        };
      }

      if (payment.contractId) {
        const contract = await Contract.findByPk(payment.contractId, {
          attributes: ['id', 'title', 'status', 'price'],
          include: [
            {
              model: Job,
              as: 'job',
              attributes: ['id', 'title']
            }
          ]
        });

        return {
          ...paymentObj,
          contract: contract?.toJSON()
        };
      }

      return paymentObj;
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

    const payment = await Payment.findByPk(paymentId, {
      include: [
        {
          model: User,
          as: 'payer',
          attributes: ['id', 'username', 'email', 'name', 'phone']
        },
        {
          model: User,
          as: 'recipient',
          attributes: ['id', 'username', 'email', 'name']
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

    // Get related job if job publication payment
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        paymentData.job = job.toJSON();
      }
    }

    // Get related contract if contract payment
    if (payment.contractId) {
      const contract = await Contract.findByPk(payment.contractId, {
        include: [
          {
            model: Job,
            as: 'job'
          },
          {
            model: User,
            as: 'client',
            attributes: ['id', 'username', 'name']
          },
          {
            model: User,
            as: 'doer',
            attributes: ['id', 'username', 'name']
          }
        ]
      });

      if (contract) {
        paymentData.contract = contract.toJSON();
      }
    }

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
 * Approve payment proof (admin only)
 * POST /api/admin/payments/:paymentId/approve
 */
router.post("/:paymentId/approve", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { notes, proofId } = req.body;
    const adminId = req.user.id;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Find active proof
    let proof;
    if (proofId) {
      proof = await PaymentProof.findOne({
        where: { id: proofId, paymentId, isActive: true }
      });
    } else {
      proof = await PaymentProof.findOne({
        where: { paymentId, isActive: true, status: 'pending' }
      });
    }

    if (!proof) {
      res.status(404).json({ success: false, message: "Comprobante no encontrado" });
      return;
    }

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

    // Update payment
    payment.status = 'approved';
    await payment.save();

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
          body: `Tu pago para publicar "${job.title}" fue aprobado. ¡El trabajo está ahora publicado!`,
          type: 'info',
          category: 'payment',
          relatedId: job.id,
          relatedModel: 'Job',
        });
      }
    }

    // Notify user
    await Notification.create({
      recipientId: payment.payerId,
      title: 'Comprobante aprobado',
      body: 'Tu comprobante de pago fue verificado y aprobado.',
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
        proof: proof.toJSON()
      }
    });
  } catch (error: any) {
    console.error("Approve payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error aprobando pago" });
  }
});

/**
 * Reject payment proof (admin only)
 * POST /api/admin/payments/:paymentId/reject
 */
router.post("/:paymentId/reject", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { reason, notes, proofId } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      res.status(400).json({ success: false, message: "Debe proporcionar un motivo de rechazo" });
      return;
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Find active proof
    let proof;
    if (proofId) {
      proof = await PaymentProof.findOne({
        where: { id: proofId, paymentId, isActive: true }
      });
    } else {
      proof = await PaymentProof.findOne({
        where: { paymentId, isActive: true, status: 'pending' }
      });
    }

    if (!proof) {
      res.status(404).json({ success: false, message: "Comprobante no encontrado" });
      return;
    }

    if (proof.status !== 'pending') {
      res.status(400).json({ success: false, message: "Este comprobante ya fue procesado" });
      return;
    }

    // Update proof
    proof.status = 'rejected';
    proof.verifiedBy = adminId;
    proof.verifiedAt = new Date();
    proof.rejectionReason = reason;
    if (notes) proof.notes = notes;
    await proof.save();

    // Update payment
    payment.status = 'pending_verification';
    await payment.save();

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
          body: `El comprobante de pago para "${job.title}" fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
          type: 'warning',
          category: 'payment',
          relatedId: job.id,
          relatedModel: 'Job',
        });
      }
    }

    // Notify user
    await Notification.create({
      recipientId: payment.payerId,
      title: 'Comprobante rechazado',
      body: `Tu comprobante de pago fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
      type: 'warning',
      category: 'payment',
      relatedId: paymentId,
      relatedModel: 'Payment',
    });

    res.json({
      success: true,
      message: "Comprobante rechazado",
      data: {
        payment: payment.toJSON(),
        proof: proof.toJSON()
      }
    });
  } catch (error: any) {
    console.error("Reject payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error rechazando comprobante" });
  }
});

export default router;
