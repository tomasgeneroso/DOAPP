import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import Advertisement from '../../models/Advertisement.js';
import advertisementService from '../../services/advertisementService.js';
import { protect, authorize } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import cache from '../../services/cache.js';
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

    const [advertisements, total] = await Promise.all([
      Advertisement.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string))
        .populate('advertiser', 'name email')
        .populate('approvedBy', 'name email'),
      Advertisement.countDocuments(query),
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
    const advertisements = await Advertisement.find({
      status: 'pending',
      paymentStatus: 'paid',
      isApproved: false,
    })
      .sort({ createdAt: -1 })
      .populate('advertiser', 'name email');

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
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findById(req.params.id);

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
      advertisement.approvedBy = req.user!.id as any;
      advertisement.approvedAt = new Date();
      advertisement.status = 'active';

      await advertisement.save();

      // Invalidate cache
      await cache.delPattern('ads:*');

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
  [param('id').isMongoId(), body('reason').trim().notEmpty()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findById(req.params.id);

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
      await cache.delPattern('ads:*');

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
  [param('id').isMongoId(), body('priority').isInt({ min: 0, max: 10 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findById(req.params.id);

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      advertisement.priority = req.body.priority;
      await advertisement.save();

      // Invalidate cache
      await cache.delPattern('ads:*');

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
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findById(req.params.id);

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      await advertisement.deleteOne();

      // Invalidate cache
      await cache.delPattern('ads:*');

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
    const cacheKey = 'ads:stats:platform';
    const cached = await cache.get(cacheKey);

    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const [
      totalAds,
      activeAds,
      pendingAds,
      totalRevenue,
      totalImpressions,
      totalClicks,
    ] = await Promise.all([
      Advertisement.countDocuments(),
      Advertisement.countDocuments({ status: 'active' }),
      Advertisement.countDocuments({ status: 'pending', paymentStatus: 'paid' }),
      Advertisement.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      Advertisement.aggregate([
        { $group: { _id: null, total: { $sum: '$impressions' } } },
      ]),
      Advertisement.aggregate([
        { $group: { _id: null, total: { $sum: '$clicks' } } },
      ]),
    ]);

    const stats = {
      overview: {
        totalAds,
        activeAds,
        pendingApproval: pendingAds,
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
      },
      performance: {
        totalImpressions: totalImpressions[0]?.total || 0,
        totalClicks: totalClicks[0]?.total || 0,
        averageCTR:
          totalImpressions[0]?.total > 0
            ? (totalClicks[0]?.total / totalImpressions[0]?.total) * 100
            : 0,
      },
    };

    // Cache for 15 minutes
    await cache.set(cacheKey, stats, 900);

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
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findById(req.params.id)
        .populate('advertiser', 'name email trustScore')
        .populate('approvedBy', 'name email')
        .populate('paymentId');

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
