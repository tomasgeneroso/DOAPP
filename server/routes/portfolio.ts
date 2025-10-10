import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import PortfolioItem from "../models/Portfolio";
import { body, validationResult } from "express-validator";

const router = Router();

/**
 * Get user's portfolio items
 * GET /api/portfolio/user/:userId
 */
router.get("/user/:userId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 12 } = req.query;

    const items = await PortfolioItem.find({ userId })
      .sort({ featured: -1, createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await PortfolioItem.countDocuments({ userId });

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

    const item = await PortfolioItem.findById(id).populate("userId", "name avatar rating");

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
    body("images").isArray({ min: 1 }).withMessage("Debe incluir al menos una imagen"),
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

      const userId = req.user._id;
      const { title, description, category, images, tags, completedAt, clientName, projectDuration, featured } = req.body;

      const item = await PortfolioItem.create({
        userId,
        title,
        description,
        category,
        images,
        tags: tags || [],
        completedAt,
        clientName,
        projectDuration,
        featured: featured || false,
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
    const userId = req.user._id;

    const item = await PortfolioItem.findById(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Verify ownership
    if (item.userId.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para editar este elemento",
      });
      return;
    }

    const { title, description, category, images, tags, completedAt, clientName, projectDuration, featured } = req.body;

    if (title) item.title = title;
    if (description) item.description = description;
    if (category) item.category = category;
    if (images) item.images = images;
    if (tags !== undefined) item.tags = tags;
    if (completedAt !== undefined) item.completedAt = completedAt;
    if (clientName !== undefined) item.clientName = clientName;
    if (projectDuration !== undefined) item.projectDuration = projectDuration;
    if (featured !== undefined) item.featured = featured;

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
    const userId = req.user._id;

    const item = await PortfolioItem.findById(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Verify ownership
    if (item.userId.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar este elemento",
      });
      return;
    }

    await PortfolioItem.findByIdAndDelete(id);

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
    const userId = req.user._id;

    const item = await PortfolioItem.findById(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    const likeIndex = item.likes.findIndex((like) => like.toString() === userId.toString());

    if (likeIndex > -1) {
      // Unlike
      item.likes.splice(likeIndex, 1);
    } else {
      // Like
      item.likes.push(userId);
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
