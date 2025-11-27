import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Contract } from '../models/Contract.model.js';
import { Payment } from '../models/Payment.model.js';
import { BalanceTransaction } from '../models/BalanceTransaction.model.js';
import { pubsub } from '../redis.js';
import { config } from '../config.js';
import { Op } from 'sequelize';

const router = express.Router();

const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// ===========================================
// GET ALL CONTRACTS
// ===========================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { status, role, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {
      [Op.or]: [{ clientId: userId }, { doerId: userId }],
    };

    if (status) where.status = status;
    if (role === 'client') {
      delete where[Op.or];
      where.clientId = userId;
    } else if (role === 'doer') {
      delete where[Op.or];
      where.doerId = userId;
    }

    const { count, rows: contracts } = await Contract.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      contracts,
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
// GET CONTRACT BY ID
// ===========================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    // Only allow access to contract parties
    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este contrato',
      });
      return;
    }

    res.json({
      success: true,
      contract,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// CREATE CONTRACT
// ===========================================
router.post(
  '/',
  [
    body('jobId').isUUID(),
    body('doerId').isUUID(),
    body('amount').isNumeric().custom((v) => v >= 5000),
    body('startDate').isISO8601(),
    body('endDate').isISO8601(),
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

      const {
        jobId,
        doerId,
        proposalId,
        amount,
        startDate,
        endDate,
        terms,
        notes,
        commissionRate,
      } = req.body;

      // Calculate commission
      const rate = commissionRate || config.commissions.standard;
      const commissionAmount = amount * (rate / 100);
      const doerAmount = amount - commissionAmount;

      const contract = await Contract.create({
        jobId,
        clientId: userId,
        doerId,
        proposalId,
        amount,
        originalAmount: amount,
        commissionRate: rate,
        commissionAmount,
        doerAmount,
        startDate,
        endDate,
        terms,
        notes,
        status: 'pending',
        paymentStatus: 'pending',
      });

      // Publish event
      await pubsub.publish('contract:created', {
        contractId: contract.id,
        jobId,
        clientId: userId,
        doerId,
      });

      res.status(201).json({
        success: true,
        contract,
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
// CONFIRM CONTRACT (Client or Doer)
// ===========================================
router.post('/:id/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este contrato',
      });
      return;
    }

    if (contract.status !== 'in_progress' && contract.status !== 'pending_confirmation') {
      res.status(400).json({
        success: false,
        message: 'El contrato no está en un estado confirmable',
      });
      return;
    }

    // Confirm based on role
    if (userId === contract.clientId) {
      await contract.confirmByClient();
    } else {
      await contract.confirmByDoer();
    }

    // If both confirmed, release payment
    if (contract.isCompleted()) {
      // Create balance transaction for doer
      await BalanceTransaction.createTransaction(
        contract.doerId,
        'payment',
        Number(contract.doerAmount),
        0, // TODO: Get actual balance
        {
          contractId: contract.id,
          description: `Pago por contrato #${contract.id.slice(0, 8)}`,
        }
      );

      // Publish completion event
      await pubsub.publish('contract:completed', {
        contractId: contract.id,
        clientId: contract.clientId,
        doerId: contract.doerId,
        amount: contract.amount,
      });
    }

    res.json({
      success: true,
      contract,
      message: contract.isCompleted()
        ? 'Contrato completado y pago liberado'
        : 'Confirmación registrada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// REQUEST DISPUTE
// ===========================================
router.post('/:id/dispute', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { reason, description } = req.body;

    if (!reason || !description) {
      res.status(400).json({
        success: false,
        message: 'Se requiere razón y descripción',
      });
      return;
    }

    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este contrato',
      });
      return;
    }

    // Generate dispute ID (in real app, create Dispute record)
    const disputeId = `DSP-${Date.now()}`;
    await contract.markAsDisputed(disputeId);

    // Publish dispute event
    await pubsub.publish('contract:disputed', {
      contractId: contract.id,
      disputeId,
      initiatorId: userId,
      reason,
    });

    res.json({
      success: true,
      contract,
      disputeId,
      message: 'Disputa iniciada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// CANCEL CONTRACT
// ===========================================
router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { reason } = req.body;

    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este contrato',
      });
      return;
    }

    if (contract.status === 'completed' || contract.status === 'cancelled') {
      res.status(400).json({
        success: false,
        message: 'El contrato no puede ser cancelado',
      });
      return;
    }

    await contract.cancel(userId, reason);

    // Publish cancellation event
    await pubsub.publish('contract:cancelled', {
      contractId: contract.id,
      cancelledBy: userId,
      reason,
    });

    res.json({
      success: true,
      contract,
      message: 'Contrato cancelado',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// REQUEST EXTENSION
// ===========================================
router.post('/:id/request-extension', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { newEndDate, additionalAmount } = req.body;

    if (!newEndDate) {
      res.status(400).json({
        success: false,
        message: 'Se requiere nueva fecha de finalización',
      });
      return;
    }

    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este contrato',
      });
      return;
    }

    if (contract.hasExtension) {
      res.status(400).json({
        success: false,
        message: 'Este contrato ya tiene una extensión pendiente o aprobada',
      });
      return;
    }

    await contract.update({
      hasExtension: true,
      extensionEndDate: newEndDate,
      extensionAmount: additionalAmount || 0,
      extensionStatus: 'pending',
    });

    // Publish extension request event
    await pubsub.publish('contract:extension_requested', {
      contractId: contract.id,
      requestedBy: userId,
      newEndDate,
      additionalAmount,
    });

    res.json({
      success: true,
      contract,
      message: 'Extensión solicitada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// APPROVE/REJECT EXTENSION
// ===========================================
router.post('/:id/approve-extension', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { approved } = req.body;

    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes acceso a este contrato',
      });
      return;
    }

    if (!contract.hasExtension || contract.extensionStatus !== 'pending') {
      res.status(400).json({
        success: false,
        message: 'No hay extensión pendiente',
      });
      return;
    }

    if (approved) {
      await contract.update({
        endDate: contract.extensionEndDate,
        extensionStatus: 'approved',
        amount: Number(contract.amount) + Number(contract.extensionAmount || 0),
      });
    } else {
      await contract.update({
        extensionStatus: 'rejected',
      });
    }

    res.json({
      success: true,
      contract,
      message: approved ? 'Extensión aprobada' : 'Extensión rechazada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
