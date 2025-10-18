import express, { Response } from "express";
import { body, validationResult } from "express-validator";
import BlogPost from "../../models/BlogPost.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();

// All routes require authentication and blog management permissions
router.use(protect);
router.use(requirePermission("blog.manage"));

// @route   GET /api/admin/blogs
// @desc    Get all blog posts (including drafts)
// @access  Private (Admin)
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;

    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      BlogPost.countDocuments(query),
    ]);

    res.json({
      success: true,
      posts,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/blogs/:id
// @desc    Get single blog post by ID
// @access  Private (Admin)
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await BlogPost.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      post,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/admin/blogs
// @desc    Create new blog post
// @access  Private (Admin)
router.post(
  "/",
  [
    body("title").trim().notEmpty().withMessage("El título es requerido"),
    body("subtitle").trim().notEmpty().withMessage("El subtítulo es requerido"),
    body("content").trim().notEmpty().withMessage("El contenido es requerido"),
    body("excerpt").trim().notEmpty().withMessage("El extracto es requerido"),
    body("author").trim().notEmpty().withMessage("El autor es requerido"),
    body("category").notEmpty().withMessage("La categoría es requerida"),
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

      const {
        title,
        subtitle,
        slug,
        content,
        excerpt,
        author,
        coverImage,
        tags,
        category,
        status,
      } = req.body;

      // Check if slug already exists
      if (slug) {
        const existingPost = await BlogPost.findOne({ slug });
        if (existingPost) {
          res.status(400).json({
            success: false,
            message: "Ya existe un artículo con este slug",
          });
          return;
        }
      }

      const post = await BlogPost.create({
        title,
        subtitle,
        slug,
        content,
        excerpt,
        author,
        coverImage,
        tags: tags || [],
        category,
        status: status || "draft",
        createdBy: req.user._id,
      });

      const populatedPost = await BlogPost.findById(post._id)
        .populate("createdBy", "name email");

      res.status(201).json({
        success: true,
        post: populatedPost,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/admin/blogs/:id
// @desc    Update blog post
// @access  Private (Admin)
router.put(
  "/:id",
  [
    body("title").optional().trim().notEmpty().withMessage("El título no puede estar vacío"),
    body("subtitle").optional().trim().notEmpty().withMessage("El subtítulo no puede estar vacío"),
    body("content").optional().trim().notEmpty().withMessage("El contenido no puede estar vacío"),
    body("excerpt").optional().trim().notEmpty().withMessage("El extracto no puede estar vacío"),
    body("author").optional().trim().notEmpty().withMessage("El autor no puede estar vacío"),
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

      const post = await BlogPost.findById(req.params.id);

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Artículo no encontrado",
        });
        return;
      }

      const {
        title,
        subtitle,
        slug,
        content,
        excerpt,
        author,
        coverImage,
        tags,
        category,
        status,
      } = req.body;

      // Check if new slug conflicts with existing post
      if (slug && slug !== post.slug) {
        const existingPost = await BlogPost.findOne({ slug });
        if (existingPost) {
          res.status(400).json({
            success: false,
            message: "Ya existe un artículo con este slug",
          });
          return;
        }
        post.slug = slug;
      }

      if (title !== undefined) post.title = title;
      if (subtitle !== undefined) post.subtitle = subtitle;
      if (content !== undefined) post.content = content;
      if (excerpt !== undefined) post.excerpt = excerpt;
      if (author !== undefined) post.author = author;
      if (coverImage !== undefined) post.coverImage = coverImage;
      if (tags !== undefined) post.tags = tags;
      if (category !== undefined) post.category = category;
      if (status !== undefined) post.status = status;

      post.updatedBy = req.user._id;

      await post.save();

      const populatedPost = await BlogPost.findById(post._id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      res.json({
        success: true,
        post: populatedPost,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   DELETE /api/admin/blogs/:id
// @desc    Delete blog post
// @access  Private (Admin)
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await BlogPost.findById(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    await post.deleteOne();

    res.json({
      success: true,
      message: "Artículo eliminado correctamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/blogs/stats/overview
// @desc    Get blog statistics
// @access  Private (Admin)
router.get("/stats/overview", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalPosts, publishedPosts, draftPosts, totalViews] = await Promise.all([
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ status: "published" }),
      BlogPost.countDocuments({ status: "draft" }),
      BlogPost.aggregate([
        { $group: { _id: null, total: { $sum: "$views" } } },
      ]),
    ]);

    const mostViewedPosts = await BlogPost.find({ status: "published" })
      .select("title slug views publishedAt")
      .sort({ views: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      stats: {
        totalPosts,
        publishedPosts,
        draftPosts,
        totalViews: totalViews[0]?.total || 0,
        mostViewedPosts,
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
