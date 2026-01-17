import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { Portfolio as PortfolioItem } from "../models/sql/Portfolio.model.js";
import { User } from "../models/sql/User.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { body, validationResult } from "express-validator";
import { Op } from "sequelize";

const router = Router();

/**
 * Get user's portfolio items
 * GET /api/portfolio/user/:userId
 */
router.get("/user/:userId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 12 } = req.query;

    const items = await PortfolioItem.findAll({
      where: { userId },
      order: [
        ['featured', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    const total = await PortfolioItem.count({ where: { userId } });

    res.json({
      success: true,
      data: items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get portfolio item by ID
 * GET /api/portfolio/:id
 */
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const item = await PortfolioItem.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: Contract,
          as: 'contract'
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title', 'summary']
        }
      ]
    });

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Increment views
    item.views += 1;
    await item.save();

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Create portfolio item
 * POST /api/portfolio
 */
router.post(
  "/",
  protect,
  [
    body("title").trim().notEmpty().withMessage("El título es requerido"),
    body("description").trim().notEmpty().withMessage("La descripción es requerida"),
    body("category").trim().notEmpty().withMessage("La categoría es requerida"),
    body("images").optional().isArray(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const userId = req.user.id;
      const {
        title,
        description,
        category,
        price,
        images,
        videos,
        documents,
        tags,
        completedAt,
        clientName,
        projectDuration,
        featured,
        linkedContract,
        linkedJob
      } = req.body;

      // Verificar que el trabajo no esté ya en otro portfolio
      if (linkedJob) {
        const existingPortfolio = await PortfolioItem.findOne({
          where: { linkedJob }
        });

        if (existingPortfolio) {
          res.status(400).json({
            success: false,
            message: "Este trabajo ya fue agregado al portafolio. Elimina el item existente para volver a publicarlo.",
          });
          return;
        }
      }

      const item = await PortfolioItem.create({
        userId,
        title,
        description,
        category,
        price,
        images,
        videos: videos || [],
        documents: documents || [],
        tags: tags || [],
        completedAt,
        clientName,
        projectDuration,
        featured: featured || false,
        linkedContract,
        linkedJob,
      });

      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Update portfolio item
 * PUT /api/portfolio/:id
 */
router.put("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await PortfolioItem.findByPk(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Verify ownership
    if (item.userId !== userId) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para editar este elemento",
      });
      return;
    }

    const {
      title,
      description,
      category,
      price,
      images,
      videos,
      documents,
      tags,
      completedAt,
      clientName,
      projectDuration,
      featured,
      linkedContract,
      linkedJob
    } = req.body;

    // Verificar que el trabajo no esté ya en otro portfolio (excluyendo el item actual)
    if (linkedJob !== undefined && linkedJob !== item.linkedJob) {
      const existingPortfolio = await PortfolioItem.findOne({
        where: {
          linkedJob,
          id: { [Op.ne]: id }
        }
      });

      if (existingPortfolio) {
        res.status(400).json({
          success: false,
          message: "Este trabajo ya fue agregado a otro item del portafolio.",
        });
        return;
      }
    }

    if (title) item.title = title;
    if (description) item.description = description;
    if (category) item.category = category;
    if (price !== undefined) item.price = price;
    if (images) item.images = images;
    if (videos !== undefined) item.videos = videos;
    if (documents !== undefined) item.documents = documents;
    if (tags !== undefined) item.tags = tags;
    if (completedAt !== undefined) item.completedAt = completedAt;
    if (clientName !== undefined) item.clientName = clientName;
    if (projectDuration !== undefined) item.projectDuration = projectDuration;
    if (featured !== undefined) item.featured = featured;
    if (linkedContract !== undefined) item.linkedContract = linkedContract;
    if (linkedJob !== undefined) item.linkedJob = linkedJob;

    await item.save();

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Delete portfolio item
 * DELETE /api/portfolio/:id
 */
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await PortfolioItem.findByPk(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Verify ownership
    if (item.userId !== userId) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar este elemento",
      });
      return;
    }

    await item.destroy();

    res.json({
      success: true,
      message: "Elemento de portafolio eliminado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Like/Unlike portfolio item
 * POST /api/portfolio/:id/like
 */
router.post("/:id/like", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await PortfolioItem.findByPk(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    const likeIndex = item.likes.findIndex((like) => like === userId);

    if (likeIndex > -1) {
      // Unlike
      item.likes = item.likes.filter((like) => like !== userId);
    } else {
      // Like
      item.likes = [...item.likes, userId];
    }

    await item.save();

    res.json({
      success: true,
      data: {
        likes: item.likes.length,
        isLiked: likeIndex === -1,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
