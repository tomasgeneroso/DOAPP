import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Portfolio } from '../models/Portfolio.model.js';
import { cache } from '../redis.js';

const router = express.Router();

const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// ===========================================
// GET USER PORTFOLIO
// ===========================================
router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = { userId: req.params.userId };
    if (type) where.type = type;

    const { count, rows: items } = await Portfolio.findAndCountAll({
      where,
      order: [
        ['isFeatured', 'DESC'],
        ['order', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      items,
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
// GET MY PORTFOLIO
// ===========================================
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const items = await Portfolio.findAll({
      where: { userId },
      order: [
        ['isFeatured', 'DESC'],
        ['order', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });

    res.json({
      success: true,
      items,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// GET SINGLE PORTFOLIO ITEM
// ===========================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await Portfolio.findByPk(req.params.id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: 'Item no encontrado',
      });
      return;
    }

    res.json({
      success: true,
      item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// CREATE PORTFOLIO ITEM
// ===========================================
router.post(
  '/',
  [
    body('title').trim().isLength({ min: 1, max: 100 }),
    body('description').optional().isLength({ max: 500 }),
    body('type').isIn(['image', 'video', 'document', 'link']),
    body('url').isURL(),
    body('thumbnailUrl').optional().isURL(),
    body('tags').optional().isArray(),
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
        description,
        type,
        url,
        thumbnailUrl,
        isFeatured,
        linkedContractId,
        tags,
      } = req.body;

      // Get next order number
      const lastItem = await Portfolio.findOne({
        where: { userId },
        order: [['order', 'DESC']],
      });
      const order = lastItem ? lastItem.order + 1 : 0;

      const item = await Portfolio.create({
        userId,
        title,
        description,
        type,
        url,
        thumbnailUrl,
        isFeatured: isFeatured || false,
        order,
        linkedContractId,
        tags: tags || [],
      });

      res.status(201).json({
        success: true,
        item,
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
// UPDATE PORTFOLIO ITEM
// ===========================================
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const item = await Portfolio.findByPk(req.params.id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: 'Item no encontrado',
      });
      return;
    }

    if (item.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar este item',
      });
      return;
    }

    const allowedFields = [
      'title', 'description', 'type', 'url', 'thumbnailUrl',
      'isFeatured', 'order', 'tags',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await item.update(updates);

    res.json({
      success: true,
      item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// DELETE PORTFOLIO ITEM
// ===========================================
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const item = await Portfolio.findByPk(req.params.id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: 'Item no encontrado',
      });
      return;
    }

    if (item.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar este item',
      });
      return;
    }

    await item.destroy();

    res.json({
      success: true,
      message: 'Item eliminado',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// LIKE/UNLIKE PORTFOLIO ITEM
// ===========================================
router.post('/:id/like', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const item = await Portfolio.findByPk(req.params.id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: 'Item no encontrado',
      });
      return;
    }

    const alreadyLiked = item.hasLiked(userId);

    if (alreadyLiked) {
      await item.removeLike(userId);
      res.json({
        success: true,
        liked: false,
        likes: item.likes,
      });
    } else {
      await item.addLike(userId);
      res.json({
        success: true,
        liked: true,
        likes: item.likes,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
