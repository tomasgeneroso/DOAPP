import express, { Request, Response } from "express";
import { BlogPost } from "../models/sql/BlogPost.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { Op } from 'sequelize';

const router = express.Router();

// @route   GET /api/blogs
// @desc    Get all published blog posts
// @access  Public
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, tag, search, page = 1, limit = 10 } = req.query;

    const query: any = { status: "published" };

    if (category) {
      query.category = category;
    }

    if (tag) {
      query.tags = tag;
    }

    if (search) {
      query.$or = [
        { title: { [Op.regexp]: search, $options: "i" } },
        { subtitle: { [Op.regexp]: search, $options: "i" } },
        { content: { [Op.regexp]: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .select("title subtitle slug excerpt author coverImage tags category views publishedAt createdAt")
        .sort({ publishedAt: -1 })
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

// @route   GET /api/blogs/categories
// @desc    Get all categories with post counts
// @access  Public
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await BlogPost.aggregate([
      { $match: { status: "published" } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      categories: categories.map(cat => ({
        name: cat._id,
        count: cat.count,
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/tags
// @desc    Get all tags with post counts
// @access  Public
router.get("/tags", async (req: Request, res: Response): Promise<void> => {
  try {
    const tags = await BlogPost.aggregate([
      { $match: { status: "published" } },
      { $unwind: "$tags" },
      {
        $group: {
          _id: "$tags",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      success: true,
      tags: tags.map(tag => ({
        name: tag._id,
        count: tag.count,
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/:slug
// @desc    Get single blog post by slug
// @access  Public
router.get("/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      status: "published",
    });

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    // Increment views
    post.views += 1;
    await post.save();

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

// @route   GET /api/blogs/:slug/related
// @desc    Get related blog posts
// @access  Public
router.get("/:slug/related", async (req: Request, res: Response): Promise<void> => {
  try {
    const currentPost = await BlogPost.findOne({
      slug: req.params.slug,
      status: "published",
    });

    if (!currentPost) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    // Find related posts by same category or tags
    const relatedPosts = await BlogPost.find({
      _id: { [Op.ne]: currentPost._id },
      status: "published",
      [Op.or]: [
        { category: currentPost.category },
        { tags: { [Op.in]: currentPost.tags } },
      ],
    })
      .select("title subtitle slug excerpt author coverImage category publishedAt")
      .sort({ publishedAt: -1 })
      .limit(3)
      .lean();

    res.json({
      success: true,
      posts: relatedPosts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
