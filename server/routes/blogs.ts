import express, { Request, Response } from "express";
import { BlogPost } from "../models/sql/BlogPost.model.js";
import { Post } from "../models/sql/Post.model.js";
import { User } from "../models/sql/User.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { Op, fn, col, literal } from 'sequelize';
import { body, validationResult } from "express-validator";
import { uploadBlogCover } from "../middleware/upload.js";

const router = express.Router();

// @route   GET /api/blogs
// @desc    Get all published blog posts (official from blog_posts + user articles from posts)
// @access  Public
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, tag, search, page = 1, limit = 10, type, featured } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // Array to hold all blog posts
    let allPosts: any[] = [];

    // 1. Get official blog posts from blog_posts table
    // Skip if filtering by 'user' type or 'comunidad' category (virtual category for user articles)
    const skipOfficialPosts = type === 'user' || category === 'comunidad';

    if (!skipOfficialPosts) {
      const blogWhere: any = { status: "published" };

      if (category) blogWhere.category = category;
      if (tag) blogWhere.tags = { [Op.contains]: [tag] };
      if (featured === 'true') blogWhere.featured = true;
      if (search) {
        blogWhere[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { subtitle: { [Op.iLike]: `%${search}%` } },
          { content: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const officialPosts = await BlogPost.findAll({
        where: blogWhere,
        include: [{
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'avatar'],
        }],
        order: [["createdAt", "DESC"]],
      });

      // Transform official posts
      allPosts.push(...officialPosts.map(post => {
        const p = post.toJSON() as any;
        return {
          _id: p.id,
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          slug: p.slug,
          excerpt: p.excerpt,
          content: p.content,
          coverImage: p.coverImage,
          tags: p.tags || [],
          category: p.category,
          views: p.views || 0,
          postType: 'official',
          readingTime: p.readingTime || 5,
          featured: p.featured || false,
          seoScore: p.seoScore || 0,
          createdAt: p.createdAt,
          publishedAt: p.publishedAt || p.createdAt,
          creator: p.creator,
          source: 'blog_posts',
        };
      }));
    }

    // 2. Get user articles from posts table (if not filtering by 'official' only)
    // Skip if filtering by a specific category that is not 'comunidad'
    const skipUserArticles = type === 'official' || (category && category !== 'comunidad');

    if (!skipUserArticles) {
      const postWhere: any = {
        type: 'article',
        isPublished: true,
      };

      if (search) {
        postWhere[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (tag) {
        postWhere.tags = { [Op.contains]: [tag] };
      }

      const userArticles = await Post.findAll({
        where: postWhere,
        include: [{
          association: 'authorUser',
          attributes: ['id', 'name', 'avatar'],
        }],
        order: [["createdAt", "DESC"]],
      });

      // Transform user articles to match blog format
      allPosts.push(...userArticles.map(post => {
        const p = post.toJSON() as any;
        // Extract first image from gallery as cover
        const coverImage = p.gallery && p.gallery.length > 0 ? p.gallery[0].url : null;
        // Calculate reading time (approx 200 words per minute)
        const wordCount = (p.description || '').split(/\s+/).length;
        const readingTime = Math.max(1, Math.ceil(wordCount / 200));

        return {
          _id: p.id,
          id: p.id,
          title: p.title,
          subtitle: '',
          slug: p.id, // Use ID as slug for user articles
          excerpt: (p.description || '').substring(0, 200).replace(/<[^>]*>/g, '') + '...',
          content: p.description,
          coverImage,
          tags: p.tags || [],
          category: 'comunidad',
          views: p.viewsCount || 0,
          postType: 'user',
          readingTime,
          featured: false,
          seoScore: 0,
          createdAt: p.createdAt,
          publishedAt: p.createdAt,
          creator: p.authorUser ? {
            id: p.authorUser.id,
            name: p.authorUser.name,
            avatar: p.authorUser.avatar,
          } : null,
          source: 'posts',
        };
      }));
    }

    // Sort all posts by date (newest first), featured posts at top
    allPosts.sort((a, b) => {
      // Featured posts first
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      // Then by date
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Pagination
    const total = allPosts.length;
    const offset = (pageNum - 1) * limitNum;
    const paginatedPosts = allPosts.slice(offset, offset + limitNum);

    res.json({
      success: true,
      posts: paginatedPosts,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error: any) {
    console.error('[Blogs] Error fetching blogs:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/categories
// @desc    Get all categories with post counts (combines blog_posts + posts)
// @access  Public
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  try {
    // Get categories from blog_posts
    const blogCategories = await BlogPost.findAll({
      where: { status: "published" },
      attributes: [
        "category",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["category"],
      raw: true,
    }) as any[];

    // Count user articles (they all go to 'comunidad' category)
    const userArticleCount = await Post.count({
      where: {
        type: 'article',
        isPublished: true,
      },
    });

    // Build categories map
    const categoriesMap: Record<string, number> = {};
    blogCategories.forEach((cat: any) => {
      categoriesMap[cat.category] = parseInt(cat.count);
    });

    // Add 'comunidad' category for user articles
    if (userArticleCount > 0) {
      categoriesMap['comunidad'] = (categoriesMap['comunidad'] || 0) + userArticleCount;
    }

    // Convert to array and sort by count
    const sortedCategories = Object.entries(categoriesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      categories: sortedCategories,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/tags
// @desc    Get all tags with post counts (combines blog_posts + posts)
// @access  Public
router.get("/tags", async (req: Request, res: Response): Promise<void> => {
  try {
    // Count tags manually since PostgreSQL array aggregation is complex
    const tagCounts: Record<string, number> = {};

    // Get tags from blog_posts
    const blogPosts = await BlogPost.findAll({
      where: { status: "published" },
      attributes: ["tags"],
      raw: true,
    });

    blogPosts.forEach((post: any) => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Get tags from user articles (posts table)
    const userArticles = await Post.findAll({
      where: {
        type: 'article',
        isPublished: true,
      },
      attributes: ["tags"],
      raw: true,
    });

    userArticles.forEach((post: any) => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Sort by count and limit to 20
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    res.json({
      success: true,
      tags: sortedTags,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/seo-tips
// @desc    Get SEO tips for users
// @access  Public
router.get("/seo-tips", async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    tips: [
      {
        title: "Título optimizado",
        description: "Usa 30-60 caracteres. Incluye tu palabra clave principal al inicio.",
        icon: "title",
        importance: "high",
      },
      {
        title: "Meta descripción",
        description: "Escribe 120-160 caracteres que resuman el contenido y atraigan clics.",
        icon: "description",
        importance: "high",
      },
      {
        title: "Palabras clave",
        description: "Incluye 3-5 palabras clave relevantes. Úsalas naturalmente en el contenido.",
        icon: "key",
        importance: "medium",
      },
      {
        title: "Contenido extenso",
        description: "Escribe al menos 300 palabras. Los artículos de 1000+ palabras rankean mejor.",
        icon: "content",
        importance: "high",
      },
      {
        title: "Estructura con subtítulos",
        description: "Usa H2 y H3 para organizar el contenido. Facilita la lectura y el SEO.",
        icon: "heading",
        importance: "medium",
      },
      {
        title: "Imágenes optimizadas",
        description: "Agrega imágenes relevantes con texto alternativo descriptivo.",
        icon: "image",
        importance: "medium",
      },
      {
        title: "URL amigable",
        description: "Mantén el slug corto y descriptivo. Evita caracteres especiales.",
        icon: "link",
        importance: "low",
      },
      {
        title: "Enlaces internos",
        description: "Enlaza a otros artículos relacionados de la plataforma.",
        icon: "internal-link",
        importance: "low",
      },
    ],
  });
});

// @route   GET /api/blogs/my-posts
// @desc    Get current user's blog posts
// @access  Private
router.get("/my-posts", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const where: any = { createdBy: req.user.id };

    if (status && ['draft', 'published', 'archived'].includes(status as string)) {
      where.status = status;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const { rows: posts, count: total } = await BlogPost.findAndCountAll({
      where,
      attributes: [
        "id", "title", "subtitle", "slug", "excerpt", "coverImage",
        "tags", "category", "views", "status", "publishedAt", "createdAt",
        "postType", "readingTime", "seoScore", "metaTitle", "metaDescription"
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: limitNum,
    });

    res.json({
      success: true,
      posts: posts.map(post => ({
        _id: post.id,
        ...post.toJSON(),
        seoSuggestions: post.getSeoSuggestions(),
      })),
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

// @route   POST /api/blogs
// @desc    Create a new blog post (user)
// @access  Private
router.post(
  "/",
  protect,
  uploadBlogCover.single('coverImage'),
  [
    body("title").trim().notEmpty().withMessage("El título es requerido")
      .isLength({ max: 200 }).withMessage("El título no puede exceder 200 caracteres"),
    body("subtitle").trim().notEmpty().withMessage("El subtítulo es requerido")
      .isLength({ max: 300 }).withMessage("El subtítulo no puede exceder 300 caracteres"),
    body("content").trim().notEmpty().withMessage("El contenido es requerido"),
    body("excerpt").trim().notEmpty().withMessage("El extracto es requerido")
      .isLength({ max: 500 }).withMessage("El extracto no puede exceder 500 caracteres"),
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
        content,
        excerpt,
        category,
        tags,
        metaTitle,
        metaDescription,
        metaKeywords,
        status,
      } = req.body;

      // Get user name for author field
      const user = await User.findByPk(req.user.id);
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      // Process cover image
      const coverImage = req.file ? `/uploads/blogs/${req.file.filename}` : undefined;

      // Generate unique slug
      let baseSlug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);

      let slug = baseSlug;
      let counter = 1;
      while (await BlogPost.findOne({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const post = await BlogPost.create({
        title,
        subtitle,
        slug,
        content,
        excerpt,
        author: user.name,
        coverImage,
        category,
        tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
        postType: 'user',
        status: status === 'published' ? 'published' : 'draft',
        metaTitle: metaTitle || title.substring(0, 70),
        metaDescription: metaDescription || excerpt.substring(0, 160),
        metaKeywords: metaKeywords ? (typeof metaKeywords === 'string' ? JSON.parse(metaKeywords) : metaKeywords) : [],
        createdBy: req.user.id,
      });

      res.status(201).json({
        success: true,
        post: {
          _id: post.id,
          ...post.toJSON(),
          seoSuggestions: post.getSeoSuggestions(),
        },
        message: status === 'published'
          ? "Artículo publicado exitosamente"
          : "Borrador guardado exitosamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/blogs/:id
// @desc    Update user's blog post
// @access  Private
router.put(
  "/:id",
  protect,
  uploadBlogCover.single('coverImage'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const post = await BlogPost.findByPk(req.params.id);

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Artículo no encontrado",
        });
        return;
      }

      // Check ownership (only creator can edit their posts)
      if (post.createdBy !== req.user.id) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para editar este artículo",
        });
        return;
      }

      const {
        title,
        subtitle,
        content,
        excerpt,
        category,
        tags,
        metaTitle,
        metaDescription,
        metaKeywords,
        status,
      } = req.body;

      // Update fields
      if (title !== undefined) post.title = title;
      if (subtitle !== undefined) post.subtitle = subtitle;
      if (content !== undefined) post.content = content;
      if (excerpt !== undefined) post.excerpt = excerpt;
      if (category !== undefined) post.category = category;
      if (tags !== undefined) post.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      if (metaTitle !== undefined) post.metaTitle = metaTitle;
      if (metaDescription !== undefined) post.metaDescription = metaDescription;
      if (metaKeywords !== undefined) post.metaKeywords = typeof metaKeywords === 'string' ? JSON.parse(metaKeywords) : metaKeywords;
      if (status !== undefined && ['draft', 'published', 'archived'].includes(status)) {
        post.status = status;
      }

      // Update cover image if provided
      if (req.file) {
        post.coverImage = `/uploads/blogs/${req.file.filename}`;
      }

      post.updatedBy = req.user.id;
      await post.save();

      res.json({
        success: true,
        post: {
          _id: post.id,
          ...post.toJSON(),
          seoSuggestions: post.getSeoSuggestions(),
        },
        message: "Artículo actualizado exitosamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   DELETE /api/blogs/:id
// @desc    Delete user's blog post
// @access  Private
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await BlogPost.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    // Check ownership
    if (post.createdBy !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar este artículo",
      });
      return;
    }

    await post.destroy();

    res.json({
      success: true,
      message: "Artículo eliminado exitosamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/:id/seo-analysis
// @desc    Get SEO analysis for a specific post
// @access  Private (owner only)
router.get("/:id/seo-analysis", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await BlogPost.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    // Check ownership
    if (post.createdBy !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver el análisis de este artículo",
      });
      return;
    }

    const wordCount = post.content.split(/\s+/).length;
    const suggestions = post.getSeoSuggestions();

    res.json({
      success: true,
      analysis: {
        seoScore: post.seoScore,
        readingTime: post.readingTime,
        wordCount,
        titleLength: post.title.length,
        metaTitleLength: post.metaTitle?.length || 0,
        metaDescriptionLength: post.metaDescription?.length || 0,
        tagsCount: post.tags.length,
        keywordsCount: post.metaKeywords?.length || 0,
        hasHeadings: post.content.includes('<h2') || post.content.includes('<h3'),
        hasImages: post.content.includes('<img') || !!post.coverImage,
        suggestions,
        scoreBreakdown: {
          title: post.title && post.title.length >= 30 && post.title.length <= 60 ? 'good' : 'needs-improvement',
          metaDescription: post.metaDescription && post.metaDescription.length >= 120 && post.metaDescription.length <= 160 ? 'good' : 'needs-improvement',
          content: wordCount >= 600 ? 'good' : wordCount >= 300 ? 'fair' : 'needs-improvement',
          tags: post.tags.length >= 3 ? 'good' : 'needs-improvement',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/blogs/:slug
// @desc    Get single blog post by slug (supports both blog_posts and posts tables)
// @access  Public
router.get("/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;

    // Check if slug is a UUID (user article from posts table)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    if (isUUID) {
      // Look for user article in posts table
      const userArticle = await Post.findOne({
        where: {
          id: slug,
          type: 'article',
          isPublished: true,
        },
        include: [{
          association: 'authorUser',
          attributes: ['id', 'name', 'avatar', 'bio', 'membershipTier', 'hasMembership'],
        }],
      });

      if (userArticle) {
        // Increment views
        userArticle.viewsCount += 1;
        await userArticle.save();

        const p = userArticle.toJSON() as any;
        const coverImage = p.gallery && p.gallery.length > 0 ? p.gallery[0].url : null;
        const wordCount = (p.description || '').split(/\s+/).length;
        const readingTime = Math.max(1, Math.ceil(wordCount / 200));

        res.json({
          success: true,
          post: {
            _id: p.id,
            id: p.id,
            title: p.title,
            subtitle: '',
            slug: p.id,
            excerpt: (p.description || '').substring(0, 200).replace(/<[^>]*>/g, '') + '...',
            content: p.description,
            coverImage,
            tags: p.tags || [],
            category: 'comunidad',
            views: p.viewsCount || 0,
            postType: 'user',
            readingTime,
            featured: false,
            seoScore: 0,
            createdAt: p.createdAt,
            publishedAt: p.createdAt,
            author: p.authorUser?.name || 'Usuario',
            creator: p.authorUser ? {
              id: p.authorUser.id,
              name: p.authorUser.name,
              avatar: p.authorUser.avatar,
              bio: p.authorUser.bio,
              membershipTier: p.authorUser.membershipTier,
              hasMembership: p.authorUser.hasMembership,
            } : null,
            source: 'posts',
          },
        });
        return;
      }
    }

    // Look for official blog post in blog_posts table
    const post = await BlogPost.findOne({
      where: {
        slug: slug,
        status: "published",
      },
      include: [{
        model: User,
        as: 'creator',
        attributes: ['id', 'name', 'avatar', 'bio', 'membershipTier', 'hasMembership'],
      }],
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

    // Transform to match frontend expectations
    res.json({
      success: true,
      post: {
        _id: post.id,
        ...post.toJSON(),
        postType: 'official',
        source: 'blog_posts',
      },
    });
  } catch (error: any) {
    console.error('[Blogs] Error fetching post:', error);
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
      where: {
        slug: req.params.slug,
        status: "published",
      },
    });

    if (!currentPost) {
      res.status(404).json({
        success: false,
        message: "Artículo no encontrado",
      });
      return;
    }

    // Find related posts by same category or overlapping tags
    const relatedPosts = await BlogPost.findAll({
      where: {
        id: { [Op.ne]: currentPost.id },
        status: "published",
        [Op.or]: [
          { category: currentPost.category },
          { tags: { [Op.overlap]: currentPost.tags } },
        ],
      },
      attributes: ["id", "title", "subtitle", "slug", "excerpt", "author", "coverImage", "category", "publishedAt"],
      order: [["publishedAt", "DESC"]],
      limit: 3,
    });

    // Transform to match frontend expectations
    const transformedPosts = relatedPosts.map(post => ({
      _id: post.id,
      ...post.toJSON(),
    }));

    res.json({
      success: true,
      posts: transformedPosts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
