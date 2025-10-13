import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import Review from "../models/Review";
import Contract from "../models/Contract";
import User from "../models/User";
import Notification from "../models/Notification";
import { body, validationResult } from "express-validator";

const router = Router();

/**
 * Create a review for a completed contract
 * POST /api/reviews
 */
router.post(
  "/",
  protect,
  [
    body("contractId").notEmpty().withMessage("Contract ID es requerido"),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating debe ser entre 1 y 5"),
    body("comment").isString().isLength({ min: 10, max: 1000 }),
    body("communication").optional().isInt({ min: 1, max: 5 }),
    body("professionalism").optional().isInt({ min: 1, max: 5 }),
    body("quality").optional().isInt({ min: 1, max: 5 }),
    body("timeliness").optional().isInt({ min: 1, max: 5 }),
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

      const { contractId, rating, comment, communication, professionalism, quality, timeliness } = req.body;
      const reviewerId = req.user._id;

      // Get contract
      const contract = await Contract.findById(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Verify contract is completed
      if (contract.status !== "completed") {
        res.status(400).json({
          success: false,
          message: "Solo puedes dejar reseñas en contratos completados",
        });
        return;
      }

      // Verify user is part of contract
      if (
        contract.client.toString() !== reviewerId.toString() &&
        contract.doer.toString() !== reviewerId.toString()
      ) {
        res.status(403).json({
          success: false,
          message: "No puedes dejar una reseña para este contrato",
        });
        return;
      }

      // Determine who is being reviewed
      const reviewedId =
        contract.client.toString() === reviewerId.toString()
          ? contract.doer
          : contract.client;

      // Check if review already exists
      const existingReview = await Review.findOne({
        contractId,
        reviewerId,
      });

      if (existingReview) {
        res.status(400).json({
          success: false,
          message: "Ya has dejado una reseña para este contrato",
        });
        return;
      }

      // Create review
      const review = await Review.create({
        contractId,
        reviewerId,
        reviewedId,
        rating,
        comment,
        communication,
        professionalism,
        quality,
        timeliness,
      });

      // Update reviewed user's rating
      await updateUserRating(reviewedId);

      // Notify reviewed user
      await Notification.create({
        userId: reviewedId,
        type: "review_received",
        title: "Nueva reseña recibida",
        message: `Has recibido una nueva reseña con ${rating} estrellas`,
        metadata: { reviewId: review._id, contractId },
      });

      res.status(201).json({
        success: true,
        data: review,
      });
    } catch (error: any) {
      console.error("Create review error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get reviews for a user
 * GET /api/reviews/user/:userId
 */
router.get("/user/:userId", async (req, res): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const reviews = await Review.find({
      reviewedId: userId,
      isVisible: true,
    })
      .populate("reviewerId", "name avatar")
      .populate("contractId", "type")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Review.countDocuments({
      reviewedId: userId,
      isVisible: true,
    });

    // Calculate stats
    const stats = await Review.aggregate([
      { $match: { reviewedId: userId, isVisible: true } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          avgCommunication: { $avg: "$communication" },
          avgProfessionalism: { $avg: "$professionalism" },
          avgQuality: { $avg: "$quality" },
          avgTimeliness: { $avg: "$timeliness" },
          count: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating",
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: reviews,
      stats: stats[0] || {
        avgRating: 0,
        count: 0,
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Get user reviews error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Respond to a review
 * POST /api/reviews/:id/respond
 */
router.post(
  "/:id/respond",
  protect,
  [body("response").isString().isLength({ min: 1, max: 500 })],
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

      const { id } = req.params;
      const { response } = req.body;
      const userId = req.user._id;

      const review = await Review.findById(id);
      if (!review) {
        res.status(404).json({
          success: false,
          message: "Reseña no encontrada",
        });
        return;
      }

      // Verify user is the one being reviewed
      if (review.reviewedId.toString() !== userId.toString()) {
        res.status(403).json({
          success: false,
          message: "Solo puedes responder a tus propias reseñas",
        });
        return;
      }

      review.response = response;
      review.respondedAt = new Date();
      await review.save();

      res.json({
        success: true,
        data: review,
      });
    } catch (error: any) {
      console.error("Respond to review error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Flag a review
 * POST /api/reviews/:id/flag
 */
router.post(
  "/:id/flag",
  protect,
  [body("reason").isString().isLength({ min: 10, max: 500 })],
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

      const { id } = req.params;
      const { reason } = req.body;

      const review = await Review.findById(id);
      if (!review) {
        res.status(404).json({
          success: false,
          message: "Reseña no encontrada",
        });
        return;
      }

      review.isFlagged = true;
      review.flagReason = reason;
      await review.save();

      res.json({
        success: true,
        message: "Reseña reportada. Será revisada por moderadores.",
      });
    } catch (error: any) {
      console.error("Flag review error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Helper function to update user's overall rating
 */
async function updateUserRating(userId: any) {
  const reviews = await Review.find({
    reviewedId: userId,
    isVisible: true,
  });

  if (reviews.length === 0) return;

  const avgRating =
    reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

  await User.findByIdAndUpdate(userId, {
    rating: Math.round(avgRating * 10) / 10, // Round to 1 decimal
    reviewsCount: reviews.length,
  });
}

export default router;
