import express, { Request, Response } from "express";
import { Op, fn, col, literal } from "sequelize";
import { User } from "../models/sql/User.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Review } from "../models/sql/Review.model.js";
import { JOB_CATEGORIES } from "../../shared/constants/categories.js";

const router = express.Router();

// @route   GET /api/users/check-username/:username
// @desc    Check if username is available
// @access  Public
router.get("/check-username/:username", async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.params.username.toLowerCase().trim();

    // Validate username format
    const usernameRegex = /^[a-z0-9._]{3,30}$/;
    if (!usernameRegex.test(username)) {
      res.json({
        success: true,
        available: false,
        message: "Formato de usuario inválido",
      });
      return;
    }

    const existingUser = await User.findOne({ where: { username } });

    res.json({
      success: true,
      available: !existingUser,
      message: existingUser ? "Este nombre de usuario ya está en uso" : "Nombre de usuario disponible",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/search
// @desc    Search users by name, username
// @access  Public
router.get("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.q as string)?.trim();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    if (!query || query.length < 2) {
      res.json({
        success: true,
        users: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
      return;
    }

    const searchPattern = `%${query}%`;

    const { count, rows: users } = await User.findAndCountAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: searchPattern } },
          { username: { [Op.iLike]: searchPattern } },
        ],
        isBanned: false,
      },
      attributes: ['id', 'name', 'username', 'avatar', 'bio', 'rating', 'reviewsCount', 'completedJobs', 'membershipTier', 'hasMembership', 'isPremiumVerified', 'hasFamilyPlan'],
      order: [['completedJobs', 'DESC'], ['rating', 'DESC']],
      offset,
      limit,
    });

    res.json({
      success: true,
      users: users.map(user => ({
        _id: user.id,
        id: user.id,
        name: user.name,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
        completedJobs: user.completedJobs,
        membershipTier: user.membershipTier,
        hasMembership: user.hasMembership,
        isPremiumVerified: user.isPremiumVerified,
        hasFamilyPlan: user.hasFamilyPlan,
      })),
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/u/:username
// @desc    Get public user profile by username
// @access  Public
router.get("/u/:username", async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.params.username.toLowerCase();

    const user = await User.findOne({
      where: { username },
      attributes: {
        exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'bankingInfo', 'notificationPreferences', 'dni']
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      user: {
        _id: user.id,
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coverImage: user.coverImage,
        bio: user.bio,
        rating: user.rating,
        workQualityRating: user.workQualityRating,
        workerRating: user.workerRating,
        contractRating: user.contractRating,
        reviewsCount: user.reviewsCount,
        workQualityReviewsCount: user.workQualityReviewsCount,
        workerReviewsCount: user.workerReviewsCount,
        contractReviewsCount: user.contractReviewsCount,
        completedJobs: user.completedJobs,
        role: user.role,
        isVerified: user.isVerified,
        membershipTier: user.membershipTier,
        hasMembership: user.hasMembership,
        isPremiumVerified: user.isPremiumVerified,
        hasFamilyPlan: user.hasFamilyPlan,
        phone: user.phone,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/:id/profile
// @desc    Get public user profile by ID
// @access  Public
router.get("/:id/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;

    const user = await User.findByPk(userId, {
      attributes: {
        exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'bankingInfo', 'notificationPreferences', 'dni']
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: user.id,
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coverImage: user.coverImage,
        bio: user.bio,
        location: user.address,
        rating: user.rating,
        workQualityRating: user.workQualityRating,
        workerRating: user.workerRating,
        contractRating: user.contractRating,
        reviewsCount: user.reviewsCount,
        jobsCompleted: user.completedJobs,
        contractsCompleted: user.completedContracts,
        role: user.role,
        isVerified: user.isVerified,
        membershipType: user.membershipTier || 'free',
        skills: user.skills || [],
        phone: user.phone,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/:id/completed-by-category
// @desc    Get user's completed jobs grouped by category with average ratings
// @access  Public
router.get("/:id/completed-by-category", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;

    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Get all completed contracts for this user as doer
    const completedContracts = await Contract.findAll({
      where: {
        doerId: userId,
        status: 'completed',
      },
      include: [
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'category'],
        },
      ],
    });

    // Get reviews for the completed contracts
    const contractIds = completedContracts.map(c => c.id);
    const reviews = await Review.findAll({
      where: {
        contractId: { [Op.in]: contractIds },
        reviewedId: userId,
      },
      attributes: ['contractId', 'rating', 'workQualityRating'],
    });

    // Create a map of contract reviews
    const reviewsByContract: Record<string, { rating: number; workQualityRating?: number }> = {};
    reviews.forEach(review => {
      reviewsByContract[review.contractId] = {
        rating: review.rating,
        workQualityRating: review.workQualityRating,
      };
    });

    // Group by category and calculate stats
    const categoryStats: Record<string, { count: number; totalRating: number; ratingCount: number }> = {};

    completedContracts.forEach(contract => {
      const category = (contract as any).job?.category || 'otros';

      if (!categoryStats[category]) {
        categoryStats[category] = { count: 0, totalRating: 0, ratingCount: 0 };
      }

      categoryStats[category].count++;

      // Add rating if available
      const review = reviewsByContract[contract.id];
      if (review) {
        const ratingToUse = review.workQualityRating || review.rating;
        if (ratingToUse) {
          categoryStats[category].totalRating += ratingToUse;
          categoryStats[category].ratingCount++;
        }
      }
    });

    // Transform to array with category labels and average ratings
    const categoriesWithStats = Object.entries(categoryStats)
      .map(([categoryId, stats]) => {
        const categoryInfo = JOB_CATEGORIES.find(c => c.id === categoryId);
        return {
          id: categoryId,
          label: categoryInfo?.label || categoryId,
          icon: categoryInfo?.icon || '📋',
          count: stats.count,
          averageRating: stats.ratingCount > 0
            ? Math.round((stats.totalRating / stats.ratingCount) * 10) / 10
            : null,
        };
      })
      .sort((a, b) => b.count - a.count); // Sort by count descending

    res.json({
      success: true,
      categories: categoriesWithStats,
      totalCompleted: completedContracts.length,
    });
  } catch (error: any) {
    console.error("Error fetching completed jobs by category:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/:id/completed-jobs
// @desc    Get user's completed jobs with details, optionally filtered by category
// @access  Public
router.get("/:id/completed-jobs", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;
    const { category, page = '1', limit = '10' } = req.query;

    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Build job where clause for category filter
    const jobWhere: any = {};
    if (category && category !== 'all') {
      jobWhere.category = category;
    }

    // Get completed contracts for this user as doer
    const { count, rows: contracts } = await Contract.findAndCountAll({
      where: {
        doerId: userId,
        status: 'completed',
      },
      include: [
        {
          model: Job,
          as: 'job',
          where: Object.keys(jobWhere).length > 0 ? jobWhere : undefined,
          attributes: ['id', 'title', 'category', 'description', 'price', 'startDate', 'endDate', 'images'],
        },
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    // Get reviews for these contracts
    const contractIds = contracts.map(c => c.id);
    const reviews = await Review.findAll({
      where: {
        contractId: { [Op.in]: contractIds },
        reviewedId: userId,
      },
      attributes: ['contractId', 'rating', 'workQualityRating', 'comment', 'createdAt'],
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
    });

    // Create a map of reviews by contract
    const reviewsByContract: Record<string, any> = {};
    reviews.forEach(review => {
      reviewsByContract[review.contractId] = review;
    });

    // Format contracts with reviews
    const formattedContracts = contracts.map(contract => {
      const job = (contract as any).job;
      const client = (contract as any).client;
      const review = reviewsByContract[contract.id];
      const categoryInfo = JOB_CATEGORIES.find(c => c.id === job?.category);

      return {
        id: contract.id,
        completedAt: contract.completedAt || contract.updatedAt,
        price: contract.price,
        job: job ? {
          id: job.id,
          title: job.title,
          category: job.category,
          categoryLabel: categoryInfo?.label || job.category,
          categoryIcon: categoryInfo?.icon || '📋',
          description: job.description?.substring(0, 200),
          image: job.images?.[0] || null,
          startDate: job.startDate,
          endDate: job.endDate,
        } : null,
        client: client ? {
          id: client.id,
          name: client.name,
          avatar: client.avatar,
        } : null,
        review: review ? {
          rating: review.workQualityRating || review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          reviewer: review.reviewer,
        } : null,
      };
    });

    res.json({
      success: true,
      contracts: formattedContracts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        pages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Error fetching completed jobs:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get public user profile by ID (legacy support)
// @access  Public
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: {
        exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'bankingInfo', 'notificationPreferences', 'dni']
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      user: {
        _id: user.id,
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coverImage: user.coverImage,
        bio: user.bio,
        rating: user.rating,
        workQualityRating: user.workQualityRating,
        workerRating: user.workerRating,
        contractRating: user.contractRating,
        reviewsCount: user.reviewsCount,
        workQualityReviewsCount: user.workQualityReviewsCount,
        workerReviewsCount: user.workerReviewsCount,
        contractReviewsCount: user.contractReviewsCount,
        completedJobs: user.completedJobs,
        role: user.role,
        isVerified: user.isVerified,
        membershipTier: user.membershipTier,
        hasMembership: user.hasMembership,
        isPremiumVerified: user.isPremiumVerified,
        hasFamilyPlan: user.hasFamilyPlan,
        phone: user.phone,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/users/:id/track-share
// @desc    Track when a user's profile is shared
// @access  Public (can be called without auth for external shares)
router.post("/:id/track-share", async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, targetUserId } = req.body;

    if (!type || !['copy_link', 'private_message'].includes(type)) {
      res.status(400).json({
        success: false,
        message: "Tipo de share inválido",
      });
      return;
    }

    const user = await User.findByPk(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Update share statistics
    user.profileSharesCount = (user.profileSharesCount || 0) + 1;
    user.lastProfileShareAt = new Date();

    if (type === 'copy_link') {
      user.profileSharesViaLink = (user.profileSharesViaLink || 0) + 1;
    } else if (type === 'private_message') {
      user.profileSharesViaMessage = (user.profileSharesViaMessage || 0) + 1;
    }

    await user.save();

    res.json({
      success: true,
      message: "Share registrado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/users/:id/share-stats
// @desc    Get profile share statistics (for PRO users)
// @access  Private (owner only)
router.get("/:id/share-stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: [
        'profileSharesCount',
        'profileSharesViaLink',
        'profileSharesViaMessage',
        'lastProfileShareAt',
        'hasMembership',
        'membershipTier',
      ],
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      stats: {
        totalShares: user.profileSharesCount || 0,
        sharesViaLink: user.profileSharesViaLink || 0,
        sharesViaMessage: user.profileSharesViaMessage || 0,
        lastShareAt: user.lastProfileShareAt,
        // Only PRO users get detailed stats
        hasFullAccess: user.hasMembership && ['pro', 'super_pro'].includes(user.membershipTier || ''),
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
