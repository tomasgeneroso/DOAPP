import express, { Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { Job } from '../models/Job.model.js';
import { Proposal } from '../models/Proposal.model.js';
import { cache } from '../redis.js';
import { Op } from 'sequelize';

const router = express.Router();

// Helper to get user from header (set by gateway)
const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// ===========================================
// GET ALL JOBS (with filters)
// ===========================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      location,
      minPrice,
      maxPrice,
      status = 'open',
      urgency,
      remoteOk,
      search,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const where: any = { publicationPaid: true };

    if (status) where.status = status;
    if (category) where.category = category;
    if (urgency) where.urgency = urgency;
    if (remoteOk === 'true') where.remoteOk = true;

    if (location) {
      where.location = { [Op.iLike]: `%${location}%` };
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = Number(minPrice);
      if (maxPrice) where.price[Op.lte] = Number(maxPrice);
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { summary: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: jobs } = await Job.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      jobs,
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
// GET JOB BY ID
// ===========================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Trabajo no encontrado',
      });
      return;
    }

    // Increment views
    await job.incrementViews();

    res.json({
      success: true,
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// CREATE JOB
// ===========================================
router.post(
  '/',
  [
    body('title').trim().notEmpty().isLength({ max: 100 }),
    body('summary').trim().notEmpty().isLength({ max: 200 }),
    body('description').trim().notEmpty().isLength({ max: 2000 }),
    body('price').isNumeric().custom((v) => v >= 0),
    body('category').trim().notEmpty(),
    body('location').trim().notEmpty(),
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
        title,
        summary,
        description,
        price,
        category,
        tags,
        location,
        latitude,
        longitude,
        remoteOk,
        startDate,
        endDate,
        urgency,
        experienceLevel,
        images,
        toolsRequired,
        materialsProvided,
      } = req.body;

      const job = await Job.create({
        title,
        summary,
        description,
        price,
        category,
        tags: tags || [],
        location,
        latitude,
        longitude,
        remoteOk: remoteOk || false,
        startDate,
        endDate,
        urgency: urgency || 'medium',
        experienceLevel: experienceLevel || 'intermediate',
        images: images || [],
        toolsRequired: toolsRequired || [],
        materialsProvided: materialsProvided || false,
        clientId: userId,
        status: 'draft',
      });

      // Invalidate cache
      await cache.delPattern('jobs:*');

      res.status(201).json({
        success: true,
        job,
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
// UPDATE JOB
// ===========================================
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Trabajo no encontrado',
      });
      return;
    }

    if (job.clientId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar este trabajo',
      });
      return;
    }

    // Only allow updates if job is in draft or pending_payment
    if (!job.isDraft()) {
      res.status(400).json({
        success: false,
        message: 'Solo puedes editar trabajos en borrador',
      });
      return;
    }

    const allowedFields = [
      'title', 'summary', 'description', 'price', 'category', 'tags',
      'location', 'latitude', 'longitude', 'remoteOk', 'startDate', 'endDate',
      'urgency', 'experienceLevel', 'images', 'toolsRequired', 'materialsProvided',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await job.update(updates);

    // Invalidate cache
    await cache.delPattern('jobs:*');

    res.json({
      success: true,
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// DELETE JOB
// ===========================================
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Trabajo no encontrado',
      });
      return;
    }

    if (job.clientId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar este trabajo',
      });
      return;
    }

    // Only allow deletion if job is draft
    if (!job.isDraft()) {
      res.status(400).json({
        success: false,
        message: 'Solo puedes eliminar trabajos en borrador',
      });
      return;
    }

    await job.destroy();

    // Invalidate cache
    await cache.delPattern('jobs:*');

    res.json({
      success: true,
      message: 'Trabajo eliminado',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// GET MY JOBS
// ===========================================
router.get('/user/my-jobs', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { status, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = { clientId: userId };
    if (status) where.status = status;

    const { count, rows: jobs } = await Job.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      jobs,
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
// SEARCH JOBS
// ===========================================
router.get('/search/advanced', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q,
      category,
      location,
      minPrice,
      maxPrice,
      urgency,
      experienceLevel,
      remoteOk,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      page = 1,
      limit = 10,
    } = req.query;

    const where: any = {
      status: 'open',
      publicationPaid: true,
    };

    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { summary: { [Op.iLike]: `%${q}%` } },
        { category: { [Op.iLike]: `%${q}%` } },
      ];
    }

    if (category) where.category = category;
    if (location) where.location = { [Op.iLike]: `%${location}%` };
    if (urgency) where.urgency = urgency;
    if (experienceLevel) where.experienceLevel = experienceLevel;
    if (remoteOk === 'true') where.remoteOk = true;

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = Number(minPrice);
      if (maxPrice) where.price[Op.lte] = Number(maxPrice);
    }

    const offset = (Number(page) - 1) * Number(limit);
    const order: any = [[sortBy as string, sortOrder as string]];

    const { count, rows: jobs } = await Job.findAndCountAll({
      where,
      order,
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      jobs,
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

export default router;
