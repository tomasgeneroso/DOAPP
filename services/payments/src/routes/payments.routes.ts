import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Payment } from '../models/Payment.model.js';
import { Contract } from '../models/Contract.model.js';
import { pubsub } from '../redis.js';
import { config } from '../config.js';
import { Op } from 'sequelize';

const router = express.Router();

const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// ===========================================
// GET USER PAYMENTS
// ===========================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { type, status, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = { userId };
    if (type) where.type = type;
    if (status) where.status = status;

    const { count, rows: payments } = await Payment.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      payments,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// GET PAYMENT BY ID
// ===========================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      res.status(404).json({
        success: false,
        message: 'Pago no encontrado',
      });
      return;
    }

    if (payment.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este pago',
      });
      return;
    }

    res.json({
      success: true,
      payment,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// CREATE PAYMENT (MercadoPago preference)
// ===========================================
router.post(
  '/create-order',
  [
    body('type').isIn(['contract', 'publication', 'membership']),
    body('amount').isNumeric().custom((v) => v > 0),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'No autorizado' });
        return;
      }

      const { type, amount, contractId, jobId, membershipId, description } = req.body;

      // Create payment record
      const payment = await Payment.create({
        userId,
        type,
        amount,
        status: 'pending',
        contractId,
        jobId,
        membershipId,
        description: description || `Pago ${type}`,
      });

      // In production, create MercadoPago preference here
      // For now, return mock preference
      const preferenceId = `PREF-${payment.id.slice(0, 8)}`;

      await payment.update({
        mercadopagoPreferenceId: preferenceId,
      });

      res.status(201).json({
        success: true,
        payment,
        preferenceId,
        // In production: init_point from MercadoPago
        initPoint: `${config.clientUrl}/checkout/${payment.id}`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor',
      });
    }
  }
);

// ===========================================
// CAPTURE PAYMENT (Simulated for dev)
// ===========================================
router.post('/:id/capture', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      res.status(404).json({
        success: false,
        message: 'Pago no encontrado',
      });
      return;
    }

    if (payment.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este pago',
      });
      return;
    }

    if (!payment.isPending()) {
      res.status(400).json({
        success: false,
        message: 'Este pago ya fue procesado',
      });
      return;
    }

    // Simulate payment capture
    const mockMpPaymentId = `MP-${Date.now()}`;
    await payment.markAsApproved(mockMpPaymentId);

    // Update related entities based on payment type
    if (payment.type === 'contract' && payment.contractId) {
      const contract = await Contract.findByPk(payment.contractId);
      if (contract) {
        await contract.update({
          paymentId: payment.id,
          mercadopagoPaymentId: mockMpPaymentId,
          paymentStatus: 'held_escrow',
          status: 'active',
        });
      }
    }

    // Publish payment event
    await pubsub.publish('payment:approved', {
      paymentId: payment.id,
      type: payment.type,
      amount: payment.amount,
      userId: payment.userId,
    });

    res.json({
      success: true,
      payment,
      message: 'Pago capturado exitosamente',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// MERCADOPAGO WEBHOOK
// ===========================================
router.post('/webhook/mercadopago', async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, data } = req.body;

    console.log(`[Payments] MercadoPago webhook: ${action}`, data);

    if (action === 'payment.created' || action === 'payment.updated') {
      const mpPaymentId = data?.id;

      if (mpPaymentId) {
        // Find payment by MP ID
        const payment = await Payment.findOne({
          where: { mercadopagoPaymentId: String(mpPaymentId) },
        });

        if (payment) {
          // In production, verify payment status with MercadoPago API
          // For now, simulate approval
          if (payment.isPending()) {
            await payment.markAsApproved(String(mpPaymentId));

            await pubsub.publish('payment:approved', {
              paymentId: payment.id,
              type: payment.type,
              amount: payment.amount,
            });
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[Payments] Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
