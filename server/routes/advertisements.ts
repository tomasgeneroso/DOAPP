import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Advertisement } from "../models/sql/Advertisement.model.js";
import { User } from "../models/sql/User.model.js";
import advertisementService from '../services/advertisementService.js';
import { protect } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import sanitizer from '../utils/sanitizer.js';
import cache from '../services/cache.js';
import { Op } from 'sequelize';

const router = express.Router();

// Validation middleware
const createAdValidation = [
  body('title').trim().notEmpty().isLength({ max: 100 }),
  body('description').trim().notEmpty().isLength({ max: 500 }),
  body('imageUrl').trim().notEmpty().isURL(),
  body('targetUrl').trim().notEmpty().isURL(),
  body('adType').isIn(['model1', 'model2', 'model3']),
  body('startDate').isISO8601().toDate(),
  body('endDate').isISO8601().toDate(),
  body('placement')
    .optional()
    .isIn(['jobs_list', 'search_results', 'dashboard', 'all']),
  body('priority').optional().isInt({ min: 0, max: 10 }),
  body('targetCategories').optional().isArray(),
  body('targetTags').optional().isArray(),
  body('targetLocations').optional().isArray(),
];

/**
 * GET /api/advertisements/pricing
 * Get pricing information for advertisements
 */
router.get('/pricing', (req: Request, res: Response) => {
  try {
    const { adType, durationDays, priority } = req.query;

    if (adType && durationDays) {
      const price = advertisementService.calculatePrice(
        adType as 'model1' | 'model2' | 'model3',
        parseInt(durationDays as string),
        priority ? parseInt(priority as string) : 0
      );

      return res.json({
        success: true,
        data: {
          adType,
          durationDays: parseInt(durationDays as string),
          priority: priority ? parseInt(priority as string) : 0,
          totalPrice: price,
        },
      });
    }

    // Return base pricing
    res.json({
      success: true,
      data: {
        basePricing: {
          model1: { pricePerDay: 50, description: 'Banner 3x1 (Premium)' },
          model2: { pricePerDay: 35, description: 'Sidebar 1x2' },
          model3: { pricePerDay: 20, description: 'Card 1x1' },
        },
        priorityPricing: 'Each priority level adds 10% to the total price',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/advertisements
 * Create new advertisement (requires authentication)
 */
router.post(
  '/',
  protect,
  createAdValidation,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      // Sanitize inputs
      const sanitizedData = {
        title: sanitizer.sanitizeInput(req.body.title),
        description: sanitizer.sanitizeInput(req.body.description),
        imageUrl: req.body.imageUrl,
        targetUrl: req.body.targetUrl,
        adType: req.body.adType,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        placement: req.body.placement || 'jobs_list',
        priority: req.body.priority || 0,
        targetCategories: req.body.targetCategories || [],
        targetTags: req.body.targetTags || [],
        targetLocations: req.body.targetLocations || [],
      };

      // Calculate duration and price
      const durationDays = Math.ceil(
        (new Date(sanitizedData.endDate).getTime() -
          new Date(sanitizedData.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const totalPrice = advertisementService.calculatePrice(
        sanitizedData.adType,
        durationDays,
        sanitizedData.priority
      );

      const pricePerDay =
        advertisementService.calculatePrice(sanitizedData.adType, 1, 0);

      // Create advertisement
      const advertisement = await Advertisement.create({
        ...sanitizedData,
        advertiserId: req.user!.id,
        pricePerDay,
        totalPrice,
        status: 'pending', // Requires payment and approval
      });

      res.status(201).json({
        success: true,
        data: advertisement,
        message:
          'Advertisement created successfully. Proceed to payment and wait for approval.',
      });
    } catch (error) {
      console.error('Error creating advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/advertisements
 * Get all advertisements for current user
 */
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const where: any = { advertiserId: req.user!.id };
    if (status) {
      where.status = status;
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const { rows: advertisements, count: total } = await Advertisement.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit as string),
      include: [
        {
          model: User,
          as: 'advertiser',
          attributes: ['name', 'email'],
        },
      ],
    });

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
 * GET /api/advertisements/active
 * Get active advertisements (public)
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const { placement = 'jobs_list' } = req.query;

    const ads = await advertisementService.getActiveAds(placement as string);

    res.json({
      success: true,
      data: ads,
    });
  } catch (error) {
    console.error('Error fetching active ads:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/advertisements/:id
 * Get advertisement by ID
 */
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findByPk(req.params.id, {
        include: [
          {
            model: User,
            as: 'advertiser',
            attributes: ['name', 'email'],
          },
        ],
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      res.json({
        success: true,
        data: advertisement,
      });
    } catch (error) {
      console.error('Error fetching advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * PUT /api/advertisements/:id
 * Update advertisement (only if pending)
 */
router.put(
  '/:id',
  protect,
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const advertisement = await Advertisement.findOne({
        where: {
          id: req.params.id,
          advertiserId: req.user!.id,
        },
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      // Only allow updates if pending
      if (advertisement.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only update pending advertisements',
        });
      }

      // Update allowed fields
      const allowedUpdates = [
        'title',
        'description',
        'imageUrl',
        'targetUrl',
        'targetCategories',
        'targetTags',
        'targetLocations',
      ];

      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          if (field === 'title' || field === 'description') {
            (advertisement as any)[field] = sanitizer.sanitizeInput(
              req.body[field]
            );
          } else {
            (advertisement as any)[field] = req.body[field];
          }
        }
      });

      await advertisement.save();

      // Invalidate cache
      await cache.delPattern('ads:*');

      res.json({
        success: true,
        data: advertisement,
        message: 'Advertisement updated successfully',
      });
    } catch (error) {
      console.error('Error updating advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * POST /api/advertisements/:id/pause
 * Pause active advertisement
 */
router.post(
  '/:id/pause',
  protect,
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const advertisement = await Advertisement.findOne({
        where: {
          id: req.params.id,
          advertiserId: req.user!.id,
        },
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      if (advertisement.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Can only pause active advertisements',
        });
      }

      advertisement.status = 'paused';
      await advertisement.save();

      // Invalidate cache
      await cache.delPattern('ads:*');

      res.json({
        success: true,
        data: advertisement,
        message: 'Advertisement paused successfully',
      });
    } catch (error) {
      console.error('Error pausing advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * POST /api/advertisements/:id/resume
 * Resume paused advertisement
 */
router.post(
  '/:id/resume',
  protect,
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const advertisement = await Advertisement.findOne({
        where: {
          id: req.params.id,
          advertiserId: req.user!.id,
        },
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      if (advertisement.status !== 'paused') {
        return res.status(400).json({
          success: false,
          message: 'Can only resume paused advertisements',
        });
      }

      advertisement.status = 'active';
      await advertisement.save();

      // Invalidate cache
      await cache.delPattern('ads:*');

      res.json({
        success: true,
        data: advertisement,
        message: 'Advertisement resumed successfully',
      });
    } catch (error) {
      console.error('Error resuming advertisement:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * POST /api/advertisements/:id/impression
 * Record impression for advertisement (public)
 */
router.post(
  '/:id/impression',
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    try {
      await advertisementService.recordImpression(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error recording impression:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * POST /api/advertisements/:id/click
 * Record click for advertisement (public)
 */
router.post(
  '/:id/click',
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    try {
      await advertisementService.recordClick(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error recording click:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/advertisements/:id/performance
 * Get performance report for advertisement
 */
router.get(
  '/:id/performance',
  protect,
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const advertisement = await Advertisement.findOne({
        where: {
          id: req.params.id,
          advertiserId: req.user!.id,
        },
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      const report = await advertisementService.getPerformanceReport(
        req.params.id
      );

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error('Error fetching performance report:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/advertisements/stats/overview
 * Get advertiser statistics overview
 */
router.get(
  '/stats/overview',
  protect,
  async (req: AuthRequest, res: Response) => {
    try {
      const stats = await advertisementService.getAdvertiserStats(req.user!.id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * DELETE /api/advertisements/:id
 * Delete advertisement (only if pending)
 */
router.delete(
  '/:id',
  protect,
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const advertisement = await Advertisement.findOne({
        where: {
          id: req.params.id,
          advertiserId: req.user!.id,
        },
      });

      if (!advertisement) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' });
      }

      // Only allow deletion if pending
      if (advertisement.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only delete pending advertisements',
        });
      }

      await advertisement.destroy();

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

export default router;
