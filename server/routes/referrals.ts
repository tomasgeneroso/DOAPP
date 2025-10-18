import express, { Response } from "express";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import User from "../models/User.js";
import Referral from "../models/Referral.js";

const router = express.Router();

// @route   GET /api/referrals/stats
// @desc    Get referral stats for current user
// @access  Private
router.get("/stats", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Get referral details
    const referrals = await Referral.find({ referrer: req.user._id })
      .populate("referred", "name email avatar createdAt")
      .sort({ createdAt: -1 });

    // Calculate stats
    const pendingReferrals = referrals.filter(r => r.status === "pending").length;
    const completedReferrals = referrals.filter(r => r.status === "completed" || r.status === "credited").length;

    res.json({
      success: true,
      stats: {
        referralCode: user.referralCode,
        totalReferrals: user.totalReferrals,
        freeContractsRemaining: user.freeContractsRemaining,
        referralEarnings: user.referralEarnings,
        pendingReferrals,
        completedReferrals,
      },
      referrals: referrals.map(r => ({
        id: r._id,
        user: r.referred,
        status: r.status,
        createdAt: r.createdAt,
        firstContractCompletedAt: r.firstContractCompletedAt,
        creditedAt: r.creditedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/referrals/validate
// @desc    Validate a referral code
// @access  Public
router.post("/validate", async (req, res): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "Código de referido requerido",
      });
      return;
    }

    const user = await User.findOne({ referralCode: code.toUpperCase() })
      .select("name avatar rating reviewsCount");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Código de referido inválido",
      });
      return;
    }

    res.json({
      success: true,
      valid: true,
      referrer: {
        name: user.name,
        avatar: user.avatar,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
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
