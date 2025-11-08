import express, { Response } from "express";
import { BlogPost } from "../../models/sql/BlogPost.model.js";
import { protect, authorize } from "../../middleware/auth.js";
import { AuthRequest } from "../../types/index.js";
import { uploadDisputeAttachments } from "../../middleware/upload.js";
import { Op } from "sequelize";

const router = express.Router();

// Get all blog articles (public)
router.get("/", async (req, res: Response) => {
  try {
    const { category, tag, featured, page = 1, limit = 10 } = req.query;
    const where: any = { status: 'published' };

    if (category) where.category = category;
    if (tag && typeof tag === 'string') {
      where.tags = { [Op.contains]: [tag] };
    }

    const offset = (Number(page) - 1) * Number(limit);
    const articles = await BlogPost.findAll({
      where,
      order: [['publishedAt', 'DESC']],
      offset,
      limit: Number(limit),
    });

    const total = await BlogPost.count({ where });

    res.json({
      articles,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching blog articles:", error);
    res.status(500).json({ message: "Error al obtener artículos" });
  }
});

// Get single blog article by slug (public)
router.get("/slug/:slug", async (req, res: Response) => {
  try {
    const article = await BlogPost.findOne({
      where: { slug: req.params.slug, isPublished: true },
      include: [{ association: "author", attributes: ["name", "avatar", "role"] }],
    });

    if (!article) {
      return res.status(404).json({ message: "Artículo no encontrado" });
    }

    // Increment view count
    article.viewsCount += 1;
    await article.save();

    res.json(article);
  } catch (error) {
    console.error("Error fetching blog article:", error);
    res.status(500).json({ message: "Error al obtener artículo" });
  }
});

// Get all articles for admin (including unpublished)
router.get(
  "/admin/all",
  protect,
  authorize("owner", "super_admin", "admin", "moderator", "support"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const query: any = {};

      if (status === 'published') query.isPublished = true;
      if (status === 'draft') query.isPublished = false;

      const offset = (Number(page) - 1) * Number(limit);
      const articles = await BlogPost.findAll({
        where: query,
        include: [{ association: "author", attributes: ["name", "avatar", "role"] }],
        order: [["createdAt", "DESC"]],
        offset,
        limit: Number(limit),
      });

      const total = await BlogPost.count({ where: query });

      res.json({
        articles,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching admin blog articles:", error);
      res.status(500).json({ message: "Error al obtener artículos" });
    }
  }
);

// Create blog article (admin roles only)
router.post(
  "/",
  protect,
  authorize("owner", "super_admin", "admin", "moderator", "support"),
  uploadDisputeAttachments,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        title,
        content,
        excerpt,
        category,
        tags,
        isPublished,
        metaDescription,
        featured,
        captions
      } = req.body;

      // Process uploaded files
      const coverImage = req.file ? `/uploads/disputes/${req.file.filename}` : undefined;

      const captionsArray = captions ? JSON.parse(captions) : [];
      const gallery = (req.files as Express.Multer.File[])?.map((file, index) => {
        const isVideo = file.mimetype.startsWith("video/");
        return {
          url: `/uploads/disputes/${file.filename}`,
          type: isVideo ? "video" : "image",
          thumbnail: isVideo ? `/uploads/disputes/${file.filename}` : undefined,
          caption: captionsArray[index] || undefined,
        };
      }) || [];

      const article = await BlogPost.create({
        author: req.user.id,
        title,
        content,
        excerpt,
        coverImage,
        gallery,
        category,
        tags: tags ? JSON.parse(tags) : [],
        isPublished: isPublished === 'true',
        metaDescription,
        featured: featured === 'true',
      });

      const populatedArticle = await BlogPost.findByPk(article.id, {
        include: [{ association: "author", attributes: ["name", "avatar", "role"] }],
      });

      res.status(201).json(populatedArticle);
    } catch (error) {
      console.error("Error creating blog article:", error);
      res.status(500).json({ message: "Error al crear artículo" });
    }
  }
);

// Update blog article (admin roles only)
router.put(
  "/:id",
  protect,
  authorize("owner", "super_admin", "admin", "moderator", "support"),
  async (req: AuthRequest, res: Response) => {
    try {
      const article = await BlogPost.findByPk(req.params.id);

      if (!article) {
        return res.status(404).json({ message: "Artículo no encontrado" });
      }

      const {
        title,
        content,
        excerpt,
        category,
        tags,
        isPublished,
        metaDescription,
        featured,
      } = req.body;

      if (title !== undefined) article.title = title;
      if (content !== undefined) article.content = content;
      if (excerpt !== undefined) article.excerpt = excerpt;
      if (category !== undefined) article.category = category;
      if (tags !== undefined) article.tags = tags;
      if (isPublished !== undefined) article.isPublished = isPublished;
      if (metaDescription !== undefined) article.metaDescription = metaDescription;
      if (featured !== undefined) article.featured = featured;

      await article.save();

      const updatedArticle = await BlogPost.findByPk(article.id, {
        include: [{ association: "author", attributes: ["name", "avatar", "role"] }],
      });

      res.json(updatedArticle);
    } catch (error) {
      console.error("Error updating blog article:", error);
      res.status(500).json({ message: "Error al actualizar artículo" });
    }
  }
);

// Delete blog article (admin roles only)
router.delete(
  "/:id",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const article = await BlogPost.findByPk(req.params.id);

      if (!article) {
        return res.status(404).json({ message: "Artículo no encontrado" });
      }

      await article.destroy();

      res.json({ message: "Artículo eliminado exitosamente" });
    } catch (error) {
      console.error("Error deleting blog article:", error);
      res.status(500).json({ message: "Error al eliminar artículo" });
    }
  }
);

// Toggle featured status
router.patch(
  "/:id/featured",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const article = await BlogPost.findByPk(req.params.id);

      if (!article) {
        return res.status(404).json({ message: "Artículo no encontrado" });
      }

      article.featured = !article.featured;
      await article.save();

      res.json(article);
    } catch (error) {
      console.error("Error toggling featured status:", error);
      res.status(500).json({ message: "Error al actualizar artículo" });
    }
  }
);

export default router;

