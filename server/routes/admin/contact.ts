import express, { Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { ContactMessage } from '../../models/sql/ContactMessage.model.js';
import { User } from '../../models/sql/User.model.js';
import { protect, authorize } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import sanitizer from '../../utils/sanitizer.js';
import { Op } from 'sequelize';

const router = express.Router();

// All admin routes require authentication and admin/support role
router.use(protect);
router.use(authorize('admin', 'support'));

/**
 * GET /api/admin/contact
 * Get all contact messages with filters
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      subject,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where: any = {};

    if (status) where.status = status;
    if (subject) where.subject = subject;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const order: any = [[sortBy as string, sortOrder === 'desc' ? 'DESC' : 'ASC']];

    const [messages, total] = await Promise.all([
      ContactMessage.findAll({
        where,
        order,
        offset,
        limit: parseInt(limit as string),
        include: [
          { model: User, as: 'userContact', attributes: ['name', 'email'] },
          { model: User, as: 'assignedAdmin', attributes: ['name', 'email'] },
          { model: User, as: 'responder', attributes: ['name', 'email'] },
        ],
      }),
      ContactMessage.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/contact/pending
 * Get pending contact messages
 */
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const messages = await ContactMessage.findAll({
      where: {
        status: 'pending',
      },
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'userContact', attributes: ['name', 'email'] },
      ],
    });

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Error fetching pending messages:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/contact/:id
 * Get contact message details
 */
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findByPk(req.params.id, {
        include: [
          { model: User, as: 'userContact', attributes: ['name', 'email'] },
          { model: User, as: 'assignedAdmin', attributes: ['name', 'email'] },
          { model: User, as: 'responder', attributes: ['name', 'email'] },
        ],
      });

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      console.error('Error fetching message:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * PUT /api/admin/contact/:id/assign
 * Assign message to admin/support user
 */
router.put(
  '/:id/assign',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findByPk(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      // Assign to current user
      await message.update({
        assignedTo: req.user!.id,
        status: 'in_progress',
      });

      res.json({
        success: true,
        data: message,
        message: 'Message assigned successfully',
      });
    } catch (error) {
      console.error('Error assigning message:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * PUT /api/admin/contact/:id/status
 * Update message status
 */
router.put(
  '/:id/status',
  [
    param('id').isUUID(),
    body('status').isIn(['pending', 'in_progress', 'resolved', 'closed']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findByPk(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      await message.update({
        status: req.body.status,
      });

      res.json({
        success: true,
        data: message,
        message: 'Status updated successfully',
      });
    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * POST /api/admin/contact/:id/respond
 * Respond to contact message
 */
router.post(
  '/:id/respond',
  [param('id').isUUID(), body('response').trim().notEmpty().isLength({ max: 2000 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findByPk(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      await message.update({
        response: sanitizer.sanitizeInput(req.body.response),
        respondedBy: req.user!.id,
        respondedAt: new Date(),
        status: 'resolved',
      });

      // TODO: Send email notification to user with response

      res.json({
        success: true,
        data: message,
        message: 'Response sent successfully',
      });
    } catch (error) {
      console.error('Error responding to message:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/admin/contact/stats/overview
 * Get contact message statistics
 */
router.get('/stats/overview', async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalMessages,
      pendingMessages,
      inProgressMessages,
      resolvedMessages,
      subjectStats,
    ] = await Promise.all([
      ContactMessage.count(),
      ContactMessage.count({ where: { status: 'pending' } }),
      ContactMessage.count({ where: { status: 'in_progress' } }),
      ContactMessage.count({ where: { status: 'resolved' } }),
      ContactMessage.findAll({
        attributes: [
          'subject',
          [ContactMessage.sequelize!.fn('COUNT', ContactMessage.sequelize!.col('id')), 'count'],
        ],
        group: ['subject'],
        raw: true,
      }),
    ]);

    const stats = {
      overview: {
        total: totalMessages,
        pending: pendingMessages,
        inProgress: inProgressMessages,
        resolved: resolvedMessages,
      },
      bySubject: subjectStats.reduce((acc: any, item: any) => {
        acc[item.subject] = parseInt(item.count);
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/admin/contact/:id
 * Delete contact message
 */
router.delete(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findByPk(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      await message.destroy();

      // Invalidate cache

      res.json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

export default router;
