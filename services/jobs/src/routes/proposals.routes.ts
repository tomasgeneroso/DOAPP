import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Proposal } from '../models/Proposal.model.js';
import { Job } from '../models/Job.model.js';
import { cache, pubsub } from '../redis.js';

const router = express.Router();

const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// ===========================================
// GET PROPOSALS FOR A JOB
// ===========================================
router.get('/job/:jobId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const job = await Job.findByPk(req.params.jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Trabajo no encontrado',
      });
      return;
    }

    // Only job owner can see all proposals
    if (job.clientId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver estas propuestas',
      });
      return;
    }

    const proposals = await Proposal.findAll({
      where: { jobId: req.params.jobId },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      proposals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// GET MY PROPOSALS
// ===========================================
router.get('/my-proposals', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { status, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = { doerId: userId };
    if (status) where.status = status;

    const { count, rows: proposals } = await Proposal.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      proposals,
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
// CREATE PROPOSAL
// ===========================================
router.post(
  '/',
  [
    body('jobId').isUUID(),
    body('message').trim().isLength({ min: 10, max: 1000 }),
    body('proposedPrice').isNumeric().custom((v) => v >= 0),
    body('estimatedDays').optional().isInt({ min: 1 }),
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

      const { jobId, message, proposedPrice, estimatedDays } = req.body;

      // Check if job exists and is open
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({
          success: false,
          message: 'Trabajo no encontrado',
        });
        return;
      }

      if (!job.isAvailable()) {
        res.status(400).json({
          success: false,
          message: 'Este trabajo no está disponible para propuestas',
        });
        return;
      }

      // Can't propose on own job
      if (job.clientId === userId) {
        res.status(400).json({
          success: false,
          message: 'No puedes enviar una propuesta a tu propio trabajo',
        });
        return;
      }

      // Check if already submitted proposal
      const existingProposal = await Proposal.findOne({
        where: { jobId, doerId: userId },
      });

      if (existingProposal) {
        res.status(400).json({
          success: false,
          message: 'Ya has enviado una propuesta para este trabajo',
        });
        return;
      }

      const proposal = await Proposal.create({
        jobId,
        doerId: userId,
        message,
        proposedPrice,
        estimatedDays,
        status: 'pending',
      });

      // Publish event for notifications
      await pubsub.publish('proposal:created', {
        proposalId: proposal.id,
        jobId,
        clientId: job.clientId,
        doerId: userId,
      });

      res.status(201).json({
        success: true,
        proposal,
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
// ACCEPT PROPOSAL
// ===========================================
router.post('/:id/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const proposal = await Proposal.findByPk(req.params.id);
    if (!proposal) {
      res.status(404).json({
        success: false,
        message: 'Propuesta no encontrada',
      });
      return;
    }

    const job = await Job.findByPk(proposal.jobId);
    if (!job || job.clientId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para aceptar esta propuesta',
      });
      return;
    }

    if (!proposal.isPending()) {
      res.status(400).json({
        success: false,
        message: 'Esta propuesta ya fue procesada',
      });
      return;
    }

    await proposal.accept();

    // Update job with doer
    await job.update({
      doerId: proposal.doerId,
      status: 'in_progress',
    });

    // Reject other proposals
    await Proposal.update(
      { status: 'rejected', rejectionReason: 'Otra propuesta fue aceptada' },
      { where: { jobId: job.id, id: { [require('sequelize').Op.ne]: proposal.id } } }
    );

    // Publish event
    await pubsub.publish('proposal:accepted', {
      proposalId: proposal.id,
      jobId: job.id,
      doerId: proposal.doerId,
    });

    res.json({
      success: true,
      proposal,
      message: 'Propuesta aceptada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// REJECT PROPOSAL
// ===========================================
router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const proposal = await Proposal.findByPk(req.params.id);
    if (!proposal) {
      res.status(404).json({
        success: false,
        message: 'Propuesta no encontrada',
      });
      return;
    }

    const job = await Job.findByPk(proposal.jobId);
    if (!job || job.clientId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para rechazar esta propuesta',
      });
      return;
    }

    if (!proposal.isPending()) {
      res.status(400).json({
        success: false,
        message: 'Esta propuesta ya fue procesada',
      });
      return;
    }

    await proposal.reject(req.body.reason);

    // Publish event
    await pubsub.publish('proposal:rejected', {
      proposalId: proposal.id,
      jobId: job.id,
      doerId: proposal.doerId,
    });

    res.json({
      success: true,
      proposal,
      message: 'Propuesta rechazada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// WITHDRAW PROPOSAL
// ===========================================
router.post('/:id/withdraw', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const proposal = await Proposal.findByPk(req.params.id);
    if (!proposal) {
      res.status(404).json({
        success: false,
        message: 'Propuesta no encontrada',
      });
      return;
    }

    if (proposal.doerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para retirar esta propuesta',
      });
      return;
    }

    if (!proposal.isPending()) {
      res.status(400).json({
        success: false,
        message: 'Esta propuesta ya fue procesada',
      });
      return;
    }

    await proposal.withdraw();

    res.json({
      success: true,
      proposal,
      message: 'Propuesta retirada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
