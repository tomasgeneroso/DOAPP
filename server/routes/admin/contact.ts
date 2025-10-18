import express, { Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import ContactMessage from '../../models/ContactMessage.js';
import { protect, authorize } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import sanitizer from '../../utils/sanitizer.js';
import cache from '../../services/cache.js';

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

    const query: any = {};

    if (status) query.status = status;
    if (subject) query.subject = subject;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const [messages, total] = await Promise.all([
      ContactMessage.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string))
        .populate('user', 'name email')
        .populate('assignedTo', 'name email')
        .populate('respondedBy', 'name email'),
      ContactMessage.countDocuments(query),
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
    const messages = await ContactMessage.find({
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .populate('user', 'name email');

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
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findById(req.params.id)
        .populate('user', 'name email')
        .populate('assignedTo', 'name email')
        .populate('respondedBy', 'name email');

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
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findById(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      // Assign to current user
      message.assignedTo = req.user!.id as any;
      message.status = 'in_progress';

      await message.save();

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
    param('id').isMongoId(),
    body('status').isIn(['pending', 'in_progress', 'resolved', 'closed']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findById(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      message.status = req.body.status;

      await message.save();

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
  [param('id').isMongoId(), body('response').trim().notEmpty().isLength({ max: 2000 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findById(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      message.response = sanitizer.sanitizeInput(req.body.response);
      message.respondedBy = req.user!.id as any;
      message.respondedAt = new Date();
      message.status = 'resolved';

      await message.save();

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
    const cacheKey = 'contact:stats:overview';
    const cached = await cache.get(cacheKey);

    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const [
      totalMessages,
      pendingMessages,
      inProgressMessages,
      resolvedMessages,
      bySubject,
    ] = await Promise.all([
      ContactMessage.countDocuments(),
      ContactMessage.countDocuments({ status: 'pending' }),
      ContactMessage.countDocuments({ status: 'in_progress' }),
      ContactMessage.countDocuments({ status: 'resolved' }),
      ContactMessage.aggregate([
        {
          $group: {
            _id: '$subject',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {
      overview: {
        total: totalMessages,
        pending: pendingMessages,
        inProgress: inProgressMessages,
        resolved: resolvedMessages,
      },
      bySubject: bySubject.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    };

    // Cache for 10 minutes
    await cache.set(cacheKey, stats, 600);

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
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const message = await ContactMessage.findById(req.params.id);

      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: 'Message not found' });
      }

      await message.deleteOne();

      // Invalidate cache
      await cache.delPattern('contact:*');

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
