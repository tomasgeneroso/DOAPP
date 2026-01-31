import express, { Request, Response } from "express";
import { Post } from "../models/sql/Post.model.js";
import { PostComment } from "../models/sql/PostComment.model.js";
import { protect } from "../middleware/auth.js";
import { uploadPostGallery } from "../middleware/upload.js";
import type { AuthRequest } from "../middleware/auth.js";

const router = express.Router();

// @route   GET /api/posts
// @desc    Get all published posts with pagination
// @access  Public
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const type = req.query.type as string; // 'post' or 'article'
    const userId = req.query.userId as string;

    const filter: any = { isPublished: true };
    if (type) filter.type = type;
    if (userId) filter.author = userId;

    const posts = await Post.findAll({
      where: filter,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limit,
      include: [{
        association: 'authorUser',
        attributes: ['id', 'name', 'avatar', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
      }],
    });

    const total = await Post.count({ where: filter });

    // Transform posts to match frontend expectations
    const transformedPosts = posts.map(post => {
      const postData = post.toJSON() as any;
      return {
        _id: postData.id,
        ...postData,
        author: postData.authorUser ? {
          _id: postData.authorUser.id,
          name: postData.authorUser.name,
          avatar: postData.authorUser.avatar,
          membershipTier: postData.authorUser.membershipTier,
          hasMembership: postData.authorUser.hasMembership,
          isPremiumVerified: postData.authorUser.isPremiumVerified,
        } : null,
      };
    });

    res.json({
      success: true,
      posts: transformedPosts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener publicaciones",
    });
  }
});

// @route   GET /api/posts/:id
// @desc    Get single post by ID
// @access  Public
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id, {
      include: [
        {
          association: 'authorUser',
          attributes: ['id', 'name', 'avatar', 'bio', 'membershipTier', 'hasMembership', 'isPremiumVerified', 'rating', 'completedJobs'],
        },
        {
          association: 'contract',
          attributes: ['id', 'status', 'price'],
        },
      ],
    });

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    // Increment view count
    post.viewsCount += 1;
    await post.save();

    // Transform to match frontend expectations
    const postData = post.toJSON() as any;
    const transformedPost = {
      _id: postData.id,
      ...postData,
      author: postData.authorUser ? {
        _id: postData.authorUser.id,
        name: postData.authorUser.name,
        avatar: postData.authorUser.avatar,
        bio: postData.authorUser.bio,
        membershipTier: postData.authorUser.membershipTier,
        hasMembership: postData.authorUser.hasMembership,
        isPremiumVerified: postData.authorUser.isPremiumVerified,
        rating: postData.authorUser.rating,
        completedJobs: postData.authorUser.completedJobs,
      } : null,
    };

    res.json({
      success: true,
      post: transformedPost,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener publicación",
    });
  }
});

// @route   POST /api/posts
// @desc    Create a new post
// @access  Private
router.post(
  "/",
  protect,
  uploadPostGallery,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { title, description, price, currency, type, tags, linkedContract, captions } = req.body;

      // Parse captions if provided
      const captionsArray = captions ? JSON.parse(captions) : [];

      // Process uploaded files with captions
      const gallery = (req.files as Express.Multer.File[])?.map((file, index) => {
        const isVideo = file.mimetype.startsWith("video/");
        return {
          url: `/uploads/disputes/${file.filename}`,
          type: isVideo ? "video" : "image",
          thumbnail: isVideo ? `/uploads/disputes/${file.filename}` : undefined,
          caption: captionsArray[index] || undefined,
        };
      }) || [];

      // Parse tags - handle both JSON string and array formats
      let parsedTags: string[] = [];
      if (tags) {
        if (Array.isArray(tags)) {
          parsedTags = tags;
        } else if (typeof tags === 'string') {
          try {
            parsedTags = JSON.parse(tags);
          } catch {
            // If it's not valid JSON, split by comma
            parsedTags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          }
        }
      }

      const post = await Post.create({
        author: req.user.id,
        title,
        description,
        gallery,
        price: price ? parseFloat(price) : undefined,
        currency: currency || "ARS",
        type: type || "post",
        tags: parsedTags,
        linkedContract: linkedContract || undefined,
      });

      const populatedPost = await Post.findByPk(post.id, {
        include: [{
          association: 'authorUser',
          attributes: ['name', 'avatar', 'membershipTier', 'hasMembership'],
        }],
      });

      res.status(201).json({
        success: true,
        message: "Publicación creada exitosamente",
        post: populatedPost,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al crear publicación",
      });
    }
  }
);

// @route   PUT /api/posts/:id
// @desc    Update a post
// @access  Private (author only)
router.put(
  "/:id",
  protect,
  uploadPostGallery,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const post = await Post.findByPk(req.params.id);

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Publicación no encontrada",
        });
        return;
      }

      // Check if user is the author
      if (post.author !== req.user.id) {
        res.status(403).json({
          success: false,
          message: "No autorizado para editar esta publicación",
        });
        return;
      }

      const { title, description, price, currency, type, tags, linkedContract, isPublished } = req.body;

      // Update fields
      if (title) post.title = title;
      if (description) post.description = description;
      if (price !== undefined) post.price = parseFloat(price);
      if (currency) post.currency = currency;
      if (type) post.type = type;
      if (tags) {
        if (Array.isArray(tags)) {
          post.tags = tags;
        } else if (typeof tags === 'string') {
          try {
            post.tags = JSON.parse(tags);
          } catch {
            post.tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          }
        }
      }
      if (linkedContract !== undefined) post.linkedContract = linkedContract || undefined;
      if (isPublished !== undefined) post.isPublished = isPublished;

      // Add new gallery items if uploaded
      if (req.files && (req.files as Express.Multer.File[]).length > 0) {
        const newGallery = (req.files as Express.Multer.File[]).map((file) => {
          const isVideo = file.mimetype.startsWith("video/");
          return {
            url: `/uploads/disputes/${file.filename}`,
            type: (isVideo ? "video" : "image") as "video" | "image",
            thumbnail: isVideo ? `/uploads/disputes/${file.filename}` : undefined,
          };
        });
        post.gallery = [...post.gallery, ...newGallery];
      }

      await post.save();

      const populatedPost = await Post.findByPk(post.id, {
        include: [{
          association: 'authorUser',
          attributes: ['name', 'avatar', 'membershipTier', 'hasMembership'],
        }],
      });

      res.json({
        success: true,
        message: "Publicación actualizada exitosamente",
        post: populatedPost,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al actualizar publicación",
      });
    }
  }
);

// @route   DELETE /api/posts/:id
// @desc    Delete a post
// @access  Private (author only)
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    // Check if user is the author
    if (post.author !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No autorizado para eliminar esta publicación",
      });
      return;
    }

    // Delete all comments associated with this post
    await PostComment.destroy({ where: { post: post.id } });

    await post.destroy();

    res.json({
      success: true,
      message: "Publicación eliminada exitosamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al eliminar publicación",
    });
  }
});

// @route   POST /api/posts/:id/like
// @desc    Toggle like on a post
// @access  Private
router.post("/:id/like", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    const userId = req.user.id;
    const likeIndex = post.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      // Like
      post.likes.push(userId);
      post.likesCount += 1;
    }

    await post.save();

    res.json({
      success: true,
      liked: likeIndex === -1,
      likesCount: post.likesCount,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al dar like",
    });
  }
});

// @route   GET /api/posts/:id/comments
// @desc    Get comments for a post
// @access  Public
router.get("/:id/comments", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const comments = await PostComment.findAll({
      where: {
        post: req.params.id,
        parentComment: null,
      },
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limit,
      include: [{
        association: 'authorUser',
        attributes: ['id', 'name', 'username', 'avatar', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
      }],
    });

    const total = await PostComment.count({
      where: {
        post: req.params.id,
        parentComment: null,
      },
    });

    // Transform comments to match frontend expectations
    const transformedComments = comments.map(comment => {
      const commentData = comment.toJSON() as any;
      return {
        _id: commentData.id,
        ...commentData,
        author: commentData.authorUser ? {
          _id: commentData.authorUser.id,
          name: commentData.authorUser.name,
          username: commentData.authorUser.username,
          avatar: commentData.authorUser.avatar,
          membershipTier: commentData.authorUser.membershipTier,
          hasMembership: commentData.authorUser.hasMembership,
          isPremiumVerified: commentData.authorUser.isPremiumVerified,
        } : null,
      };
    });

    res.json({
      success: true,
      comments: transformedComments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener comentarios",
    });
  }
});

// @route   POST /api/posts/:id/comments
// @desc    Add a comment to a post
// @access  Private
router.post("/:id/comments", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content, parentComment } = req.body;

    const post = await Post.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    const comment = await PostComment.create({
      post: post.id,
      author: req.user.id,
      content,
      parentComment: parentComment || undefined,
    });

    // Update post comments count
    post.commentsCount += 1;
    await post.save();

    const populatedComment = await PostComment.findByPk(comment.id, {
      include: [{
        association: 'authorUser',
        attributes: ['id', 'name', 'username', 'avatar', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
      }],
    });

    // Transform to match frontend expectations
    const commentData = populatedComment?.toJSON() as any;
    const transformedComment = commentData ? {
      _id: commentData.id,
      ...commentData,
      author: commentData.authorUser ? {
        _id: commentData.authorUser.id,
        name: commentData.authorUser.name,
        username: commentData.authorUser.username,
        avatar: commentData.authorUser.avatar,
        membershipTier: commentData.authorUser.membershipTier,
        hasMembership: commentData.authorUser.hasMembership,
        isPremiumVerified: commentData.authorUser.isPremiumVerified,
      } : null,
    } : null;

    res.status(201).json({
      success: true,
      message: "Comentario agregado exitosamente",
      comment: transformedComment,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al agregar comentario",
    });
  }
});

// @route   DELETE /api/posts/:postId/comments/:commentId
// @desc    Delete a comment
// @access  Private (author only)
router.delete("/:postId/comments/:commentId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await PostComment.findByPk(req.params.commentId);

    if (!comment) {
      res.status(404).json({
        success: false,
        message: "Comentario no encontrado",
      });
      return;
    }

    // Check if user is the author
    if (comment.author !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No autorizado para eliminar este comentario",
      });
      return;
    }

    await comment.destroy();

    // Update post comments count
    const post = await Post.findByPk(req.params.postId);
    if (post) {
      post.commentsCount = Math.max(0, post.commentsCount - 1);
      await post.save();
    }

    res.json({
      success: true,
      message: "Comentario eliminado exitosamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al eliminar comentario",
    });
  }
});

// @route   POST /api/posts/:postId/comments/:commentId/like
// @desc    Toggle like on a comment
// @access  Private
router.post("/:postId/comments/:commentId/like", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await PostComment.findByPk(req.params.commentId);

    if (!comment) {
      res.status(404).json({
        success: false,
        message: "Comentario no encontrado",
      });
      return;
    }

    const userId = req.user.id;
    const likeIndex = comment.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      comment.likes.splice(likeIndex, 1);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    } else {
      // Like
      comment.likes.push(userId);
      comment.likesCount += 1;
    }

    await comment.save();

    res.json({
      success: true,
      liked: likeIndex === -1,
      likesCount: comment.likesCount,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al dar like al comentario",
    });
  }
});

export default router;
