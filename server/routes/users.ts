import express, { Request, Response } from "express";
import { User } from "../models/sql/User.model.js";

const router = express.Router();

// @route   GET /api/users/:id
// @desc    Get public user profile
// @access  Public
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: {
        exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'bankingInfo', 'notificationPreferences']
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
        email: user.email,
        avatar: user.avatar,
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

export default router;
