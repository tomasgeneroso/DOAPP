import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { Review } from "../models/sql/Review.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { body, validationResult } from "express-validator";
import { Op } from "sequelize";
import { sequelize } from "../config/database.js";

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
    body("timeliness").optional().isInt({ min: 1, max: 5 }),
    body("attendance").optional().isInt({ min: 1, max: 5 }),
    body("communication").optional().isInt({ min: 1, max: 5 }),
    body("fairPrice").optional().isInt({ min: 1, max: 5 }),
    body("quality").optional().isInt({ min: 1, max: 5 }),
    body("professionalism").optional().isInt({ min: 1, max: 5 }),
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

      const { contractId, rating, comment, timeliness, attendance, communication, fairPrice, quality, professionalism } = req.body;
      const reviewerId = req.user.id;

      // Get contract
      const contract = await Contract.findByPk(contractId);
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
        contract.clientId.toString() !== reviewerId.toString() &&
        contract.doerId.toString() !== reviewerId.toString()
      ) {
        res.status(403).json({
          success: false,
          message: "No puedes dejar una reseña para este contrato",
        });
        return;
      }

      // Determine who is being reviewed
      const reviewedId =
        contract.clientId.toString() === reviewerId.toString()
          ? contract.doerId
          : contract.clientId;

      // Check if review already exists
      const existingReview = await Review.findOne({
        where: {
          contractId,
          reviewerId,
        },
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
        timeliness,
        attendance,
        communication,
        fairPrice,
        quality,
        professionalism,
      });

      // Update reviewed user's rating
      await updateUserRating(reviewedId);

      // Notify reviewed user
      try {
        await Notification.create({
          recipientId: reviewedId,
          type: "success",
          category: "user",
          title: "Nueva reseña recibida",
          message: `Recibiste una reseña de ${rating} estrellas`,
          data: { reviewId: review.id, contractId },
          read: false,
        });
      } catch (notifErr) {
        console.warn('⚠️ No se pudo crear notificación de review:', (notifErr as any).message);
      }

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
 * Puntuación post-trabajo — encuesta corta de como máximo 2 preguntas:
 *   1) ¿Querés puntuar el trabajo del doer?  → rating (1-5, opcional)
 *   2) ¿Recomendarías la app?                → recommendsApp (sí/no, opcional)
 *   + nota libre opcional                    → note
 *
 * Se puede responder una sola pregunta, o ambas. Si el usuario ya respondió
 * parcialmente, esta ruta completa lo que haya quedado sin responder.
 *
 * POST /api/reviews/post-work
 */
router.post(
  "/post-work",
  protect,
  [
    body("contractId").notEmpty().withMessage("Contract ID es requerido"),
    body("rating")
      .optional({ nullable: true })
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating debe ser entre 1 y 5"),
    body("recommendsApp")
      .optional({ nullable: true })
      .isBoolean()
      .withMessage("recommendsApp debe ser booleano"),
    body("note")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 1000 })
      .withMessage("La nota no puede superar los 1000 caracteres"),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { contractId } = req.body;
      const rating: number | undefined =
        req.body.rating === undefined || req.body.rating === null
          ? undefined
          : Number(req.body.rating);
      const recommendsApp: boolean | undefined =
        req.body.recommendsApp === undefined || req.body.recommendsApp === null
          ? undefined
          : Boolean(req.body.recommendsApp);
      const note: string | undefined =
        typeof req.body.note === "string" && req.body.note.trim().length > 0
          ? req.body.note.trim()
          : undefined;

      // Al menos una de las dos preguntas tiene que estar respondida
      if (rating === undefined && recommendsApp === undefined && note === undefined) {
        res.status(400).json({
          success: false,
          message: "Respondé al menos una pregunta o dejá una nota",
        });
        return;
      }

      const reviewerId = req.user.id;

      const contract = await Contract.findByPk(contractId);
      if (!contract) {
        res.status(404).json({ success: false, message: "Contrato no encontrado" });
        return;
      }

      if (contract.status !== "completed") {
        res.status(400).json({
          success: false,
          message: "Solo puedes puntuar contratos completados",
        });
        return;
      }

      const isClient = contract.clientId.toString() === reviewerId.toString();
      const isDoer = contract.doerId.toString() === reviewerId.toString();
      if (!isClient && !isDoer) {
        res.status(403).json({
          success: false,
          message: "No puedes puntuar este contrato",
        });
        return;
      }

      const reviewedId = isClient ? contract.doerId : contract.clientId;

      const existing = await Review.findOne({ where: { contractId, reviewerId } });

      let review: Review;
      let ratingIsNew = false;

      if (existing) {
        // Sólo completamos lo que quedó sin responder: nunca pisamos una
        // respuesta previa (ni la reseña completa).
        const updates: Record<string, any> = {};

        if (rating !== undefined && (existing.rating === null || existing.rating === undefined)) {
          updates.rating = rating;
          ratingIsNew = true;
        }
        if (recommendsApp !== undefined && (existing.recommendsApp === null || existing.recommendsApp === undefined)) {
          updates.recommendsApp = recommendsApp;
        }
        if (note !== undefined && !existing.comment) {
          updates.comment = note;
        }

        if (Object.keys(updates).length === 0) {
          res.status(400).json({
            success: false,
            message: "Ya dejaste tu puntuación para este contrato",
          });
          return;
        }

        await existing.update(updates);
        review = existing;
      } else {
        review = await Review.create({
          contractId,
          reviewerId,
          reviewedId,
          rating,
          comment: note,
          recommendsApp,
          source: "post_work",
        });
        ratingIsNew = rating !== undefined;
      }

      // La puntuación del doer sólo cambia si hubo estrellas
      if (ratingIsNew) {
        await updateUserRating(reviewedId);

        try {
          await Notification.create({
            recipientId: reviewedId,
            type: "success",
            category: "user",
            title: "Nueva puntuación recibida",
            message: `Recibiste una puntuación de ${rating} estrellas`,
            data: { reviewId: review.id, contractId },
            read: false,
          });
        } catch (notifErr) {
          console.warn(
            "⚠️ No se pudo crear notificación de puntuación:",
            (notifErr as any).message
          );
        }
      }

      res.status(201).json({ success: true, data: review });
    } catch (error: any) {
      console.error("Post-work rating error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Contratos completados que todavía esperan la puntuación post-trabajo
 * del usuario autenticado (para volver a preguntar si cerró el modal).
 *
 * GET /api/reviews/post-work/pending
 */
router.get(
  "/post-work/pending",
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user.id;

      const contracts = await Contract.findAll({
        where: {
          status: "completed",
          [Op.or]: [{ clientId: userId }, { doerId: userId }],
        },
        order: [["updatedAt", "DESC"]],
        limit: 20,
      });

      if (contracts.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      const alreadyRated = await Review.findAll({
        where: {
          reviewerId: userId,
          contractId: { [Op.in]: contracts.map((c) => c.id) },
        },
        attributes: ["contractId"],
      });
      const ratedIds = new Set(alreadyRated.map((r) => r.contractId.toString()));

      const pending = await Promise.all(
        contracts
          .filter((c) => !ratedIds.has(c.id.toString()))
          .map(async (contract) => {
            const isClient = contract.clientId.toString() === userId.toString();
            const reviewedId = isClient ? contract.doerId : contract.clientId;
            const reviewed = await User.findByPk(reviewedId, {
              attributes: ["id", "name", "avatar"],
            });

            return {
              contractId: contract.id,
              reviewedId,
              reviewedName: reviewed?.name || "",
              reviewedAvatar: reviewed?.avatar || null,
              reviewedRole: isClient ? "doer" : "client",
              completedAt: contract.updatedAt,
            };
          })
      );

      res.json({ success: true, data: pending });
    } catch (error: any) {
      console.error("Pending post-work ratings error:", error);
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

    // Sólo se listan las reseñas con puntuación: la encuesta post-trabajo
    // puede haber respondido únicamente "¿recomendarías la app?".
    const publicReviewsWhere: any = {
      reviewedId: userId,
      rating: { [Op.ne]: null },
      [Op.or]: [
        { isVisible: true },
        { isVisible: null },
      ],
    };

    const reviews = await Review.findAll({
      where: publicReviewsWhere,
      include: [
        {
          model: User,
          as: "reviewer",
          attributes: ["id", "name", "avatar"],
        },
        {
          model: Contract,
          as: "contract",
          attributes: ["id", "type"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    const total = await Review.count({ where: publicReviewsWhere });

    // Calculate stats using Sequelize aggregation
    const statsResult = await Review.findAll({
      where: publicReviewsWhere,
      attributes: [
        [sequelize.fn("AVG", sequelize.col("rating")), "avgRating"],
        [sequelize.fn("AVG", sequelize.col("timeliness")), "avgPuntualidad"],
        [sequelize.fn("AVG", sequelize.col("attendance")), "avgPresencialidad"],
        [sequelize.fn("AVG", sequelize.col("communication")), "avgComoPersona"],
        [sequelize.fn("AVG", sequelize.col("fair_price")), "avgPrecioJusto"],
        [sequelize.fn("AVG", sequelize.col("quality")), "avgCalidadTrabajo"],
        [sequelize.fn("AVG", sequelize.col("professionalism")), "avgProfesionalidad"],
        [sequelize.fn("COUNT", sequelize.col("rating")), "count"],
      ],
      raw: true,
    });

    const stats = statsResult[0] || {
      avgRating: 0,
      avgPuntualidad: 0,
      avgPresencialidad: 0,
      avgComoPersona: 0,
      avgPrecioJusto: 0,
      avgCalidadTrabajo: 0,
      avgProfesionalidad: 0,
      count: 0,
    };

    res.json({
      success: true,
      data: reviews,
      stats,
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
      const userId = req.user.id;

      const review = await Review.findByPk(id);
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

      const review = await Review.findByPk(id);
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
 * Calculates the average of a field across reviews, ignoring null/undefined values.
 */
function avg(reviews: Review[], field: keyof Review): number {
  const vals = reviews
    .map(r => r[field] as number | undefined | null)
    .filter((v): v is number => v !== null && v !== undefined);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

/**
 * Helper function to update user's overall and per-dimension ratings
 */
async function updateUserRating(userId: any) {
  const allReviews = await Review.findAll({
    where: { reviewedId: userId, isVisible: true },
  });

  // Las respuestas post-trabajo que sólo contestaron "¿recomendarías la app?"
  // no tienen estrellas y no deben contar en el promedio.
  const reviews = allReviews.filter(
    (r) => r.rating !== null && r.rating !== undefined
  );

  if (reviews.length === 0) return;

  const avgRating = Math.round(
    (reviews.reduce((sum, r) => sum + (r.rating as number), 0) / reviews.length) * 10
  ) / 10;

  await User.update(
    {
      rating: avgRating,
      reviewsCount: reviews.length,
      puntualidadRating:      avg(reviews, 'timeliness'),
      presencialidadRating:   avg(reviews, 'attendance'),
      comoPersonaRating:      avg(reviews, 'communication'),
      precioJustoRating:      avg(reviews, 'fairPrice'),
      calidadTrabajoRating:   avg(reviews, 'quality'),
      profesionalidadRating:  avg(reviews, 'professionalism'),
    },
    { where: { id: userId } }
  );
}

export default router;
