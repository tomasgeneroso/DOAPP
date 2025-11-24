import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Advertisement } from '../../models/sql/Advertisement.model.js';
import advertisementService from '../../services/advertisementService.js';
import { protect, authorize } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import sanitizer from '../../utils/sanitizer.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

/**
 * GET /api/admin/advertisements
 * Get all advertisements with filters
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      adType,
      paymentStatus,
      isApproved,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query: any = {};

    if (status) query.status = status;
    if (adType) query.adType = adType;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (isApproved !== undefined) query.isApproved = isApproved === 'true';

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const where: any = {};
    if (status) where.status = status;
    if (adType) where.adType = adType;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (isApproved !== undefined) where.isApproved = isApproved === 'true';

    const order: any = [[sortBy as string, sortOrder === 'desc' ? 'DESC' : 'ASC']];

    const [advertisements, total] = await Promise.all([
      Advertisement.findAll({
        where,
        order,
        offset: skip,
        limit: parseInt(limit as string),
        include: [
          { association: 'advertiser', attributes: ['name', 'email'] },
          { association: 'approvedBy', attributes: ['name', 'email'] },
        ],
      }),
      Advertisement.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        advertisements,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching advertisements:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/advertisements/pending
 * Get pending advertisements for approval
 */
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const advertisements = await Advertisement.findAll({
      where: {
        status: 'pending',
        paymentStatus: 'paid',
        isApproved: false,
      },
      order: [['createdAt', 'DESC']],
      include: [{ association: 'advertiser', attributes: ['name', 'email'] }],
    });

    res.json({
      success: true,
      data: advertisements,
    });
  } catch (error) {
    console.error('Error fetching pending advertisements:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/advertisements/:id/approve
 * Approve advertisement
 */
router.post(
  '/:id/approve',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findByPk(req.params.id);

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      if (advertisement.isApproved) {
        return res.status(400).json({
          success: false,
          message: 'Advertisement already approved',
        });
      }

      if (advertisement.paymentStatus !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advertisement payment must be completed before approval',
        });
      }

      advertisement.isApproved = true;
      advertisement.approvedBy = req.user!.id;
      advertisement.approvedAt = new Date();
      advertisement.status = 'active';

      await advertisement.save();

      // Invalidate cache

      // TODO: Send notification to advertiser

      res.json({
        success: true,
        data: advertisement,
        message: 'Advertisement approved successfully',
      });
    } catch (error) {
      console.error('Error approving advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * POST /api/admin/advertisements/:id/reject
 * Reject advertisement
 */
router.post(
  '/:id/reject',
  [param('id').isUUID(), body('reason').trim().notEmpty()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findByPk(req.params.id);

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      if (advertisement.status === 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'Advertisement already rejected',
        });
      }

      advertisement.status = 'rejected';
      advertisement.isApproved = false;
      advertisement.rejectionReason = sanitizer.sanitizeInput(req.body.reason);

      await advertisement.save();

      // Invalidate cache

      // TODO: Send notification to advertiser with rejection reason

      res.json({
        success: true,
        data: advertisement,
        message: 'Advertisement rejected',
      });
    } catch (error) {
      console.error('Error rejecting advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * PUT /api/admin/advertisements/:id/priority
 * Update advertisement priority
 */
router.put(
  '/:id/priority',
  [param('id').isUUID(), body('priority').isInt({ min: 0, max: 10 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findByPk(req.params.id);

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      advertisement.priority = req.body.priority;
      await advertisement.save();

      // Invalidate cache

      res.json({
        success: true,
        data: advertisement,
        message: 'Priority updated successfully',
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * DELETE /api/admin/advertisements/:id
 * Delete advertisement (admin can delete any)
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

      const advertisement = await Advertisement.findByPk(req.params.id);

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      await advertisement.destroy();

      // Invalidate cache

      res.json({
        success: true,
        message: 'Advertisement deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/admin/advertisements/stats/platform
 * Get platform-wide advertisement statistics
 */
router.get('/stats/platform', async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalAds,
      activeAds,
      pendingAds,
    ] = await Promise.all([
      Advertisement.count(),
      Advertisement.count({ where: { status: 'active' } }),
      Advertisement.count({ where: { status: 'pending', paymentStatus: 'paid' } }),
    ]);

    // TODO: implement totalRevenue aggregation with Sequelize raw query
    const totalRevenue = 0;

    // TODO: implement totalImpressions aggregation with Sequelize raw query
    const totalImpressions = 0;

    // TODO: implement totalClicks aggregation with Sequelize raw query
    const totalClicks = 0;

    const stats = {
      overview: {
        totalAds,
        activeAds,
        pendingApproval: pendingAds,
      },
      revenue: {
        total: totalRevenue,
      },
      performance: {
        totalImpressions,
        totalClicks,
        averageCTR:
          totalImpressions > 0
            ? (totalClicks / totalImpressions) * 100
            : 0,
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/advertisements/expire
 * Manually trigger expiration of ads
 */
router.post('/expire', async (req: AuthRequest, res: Response) => {
  try {
    const expiredCount = await advertisementService.expireAds();

    res.json({
      success: true,
      message: `${expiredCount} advertisements expired`,
      data: { expiredCount },
    });
  } catch (error) {
    console.error('Error expiring ads:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/advertisements/:id/full
 * Get full advertisement details with all data
 */
router.get(
  '/:id/full',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findByPk(req.params.id, {
        include: [
          { association: 'advertiser', attributes: ['name', 'email', 'trustScore'] },
          { association: 'approvedBy', attributes: ['name', 'email'] },
          { association: 'payment' },
        ],
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      const performanceReport = await advertisementService.getPerformanceReport(
        req.params.id
      );

      res.json({
        success: true,
        data: {
          advertisement,
          performance: performanceReport,
        },
      });
    } catch (error) {
      console.error('Error fetching advertisement details:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

export default router;
