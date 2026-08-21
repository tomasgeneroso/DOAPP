import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { Review } from "../models/sql/Review.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { body, validationResult } from "express-validator";
import { Op } from "sequelize";
import { sequelize } from "../config/database.js";
import {
  POST_WORK_DRAFT,
  POST_WORK_DONE,
  findPendingPostWorkRatings,
  notifyPostWorkRatingPending,
  clearPostWorkRatingNotification,
} from "../services/postWorkRating.js";

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
 * Puntuación post-trabajo. Un solo modal con dos pantallas, ambas obligatorias:
 *
 *   Pantalla 1 → rating general + dimensiones (puntualidad, como persona, ...)
 *   Pantalla 2 → recommendsApp (¿recomendarías DoApp?) + note
 *
 * Mientras no estén las dos, la fila queda como borrador
 * (source = 'post_work_draft') y el usuario no puede publicar ni postularse.
 *
 * POST /api/reviews/post-work         → finaliza (exige ambas pantallas)
 * POST /api/reviews/post-work/draft   → guarda el progreso parcial
 */

const DIMENSION_FIELDS = [
  "timeliness",
  "attendance",
  "communication",
  "fairPrice",
  "quality",
  "professionalism",
] as const;

const dimensionValidators = DIMENSION_FIELDS.map((field) =>
  body(field).optional({ nullable: true }).isInt({ min: 1, max: 5 })
);

const postWorkValidators = [
  body("contractId").notEmpty().withMessage("Contract ID es requerido"),
  body("note")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 1000 })
    .withMessage("La nota no puede superar los 1000 caracteres"),
  ...dimensionValidators,
];

interface PostWorkPayload {
  rating?: number;
  recommendsApp?: boolean;
  note?: string;
  dimensions: Record<string, number>;
}

const readPostWorkPayload = (body: any): PostWorkPayload => {
  const dimensions: Record<string, number> = {};
  for (const field of DIMENSION_FIELDS) {
    const value = body[field];
    if (value !== undefined && value !== null && Number(value) > 0) {
      dimensions[field] = Number(value);
    }
  }

  return {
    rating:
      body.rating === undefined || body.rating === null
        ? undefined
        : Number(body.rating),
    recommendsApp:
      body.recommendsApp === undefined || body.recommendsApp === null
        ? undefined
        : Boolean(body.recommendsApp),
    note:
      typeof body.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : undefined,
    dimensions,
  };
};

/**
 * Valida que el contrato exista, esté completado y que el usuario sea parte.
 * Devuelve el contrato y a quién le corresponde la puntuación, o null si ya
 * respondió (en cuyo caso la respuesta HTTP ya fue enviada).
 */
async function resolvePostWorkContract(
  req: AuthRequest,
  res: Response
): Promise<{ contract: Contract; reviewedId: string; existing: Review | null } | null> {
  const { contractId } = req.body;
  const reviewerId = req.user.id;

  const contract = await Contract.findByPk(contractId);
  if (!contract) {
    res.status(404).json({ success: false, message: "Contrato no encontrado" });
    return null;
  }

  if (contract.status !== "completed") {
    res.status(400).json({
      success: false,
      message: "Solo puedes puntuar contratos completados",
    });
    return null;
  }

  const isClient = contract.clientId.toString() === reviewerId.toString();
  const isDoer = contract.doerId.toString() === reviewerId.toString();
  if (!isClient && !isDoer) {
    res.status(403).json({
      success: false,
      message: "No puedes puntuar este contrato",
    });
    return null;
  }

  const existing = await Review.findOne({ where: { contractId, reviewerId } });

  if (existing && existing.source !== POST_WORK_DRAFT) {
    res.status(400).json({
      success: false,
      code: "ALREADY_RATED",
      message: "Ya dejaste tu puntuación para este contrato",
    });
    return null;
  }

  return {
    contract,
    reviewedId: isClient ? contract.doerId : contract.clientId,
    existing,
  };
}

/**
 * Guarda el progreso de una puntuación sin terminar, para poder retomarla.
 * POST /api/reviews/post-work/draft
 */
router.post(
  "/post-work/draft",
  protect,
  postWorkValidators,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const resolved = await resolvePostWorkContract(req, res);
      if (!resolved) return;

      const { contract, reviewedId, existing } = resolved;
      const { rating, recommendsApp, note, dimensions } = readPostWorkPayload(req.body);

      if (rating !== undefined && (rating < 1 || rating > 5)) {
        res.status(400).json({
          success: false,
          message: "Rating debe ser entre 1 y 5",
        });
        return;
      }

      const values: Record<string, any> = {
        ...dimensions,
        source: POST_WORK_DRAFT,
      };
      if (rating !== undefined) values.rating = rating;
      if (recommendsApp !== undefined) values.recommendsApp = recommendsApp;
      if (note !== undefined) values.comment = note;

      let review: Review;
      if (existing) {
        await existing.update(values);
        review = existing;
      } else {
        review = await Review.create({
          contractId: contract.id,
          reviewerId: req.user.id,
          reviewedId,
          ...values,
        });
      }

      // Aviso en notificaciones de que quedó una puntuación a medias
      await notifyPostWorkRatingPending(req.user.id, contract.id.toString(), {
        unfinished: true,
      });

      res.status(200).json({ success: true, data: review });
    } catch (error: any) {
      console.error("Post-work draft error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Finaliza la puntuación post-trabajo. Exige las dos pantallas completas.
 * POST /api/reviews/post-work
 */
router.post(
  "/post-work",
  protect,
  [
    ...postWorkValidators,
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating debe ser entre 1 y 5"),
    body("recommendsApp").isBoolean().withMessage("recommendsApp debe ser booleano"),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const resolved = await resolvePostWorkContract(req, res);
      if (!resolved) return;

      const { contract, reviewedId, existing } = resolved;
      const { rating, recommendsApp, note, dimensions } = readPostWorkPayload(req.body);

      if (rating === undefined || recommendsApp === undefined) {
        res.status(400).json({
          success: false,
          message: "Tenés que completar las dos pantallas de la puntuación",
        });
        return;
      }

      const values: Record<string, any> = {
        ...dimensions,
        rating,
        recommendsApp,
        comment: note ?? null,
        source: POST_WORK_DONE,
      };

      let review: Review;
      if (existing) {
        await existing.update(values);
        review = existing;
      } else {
        review = await Review.create({
          contractId: contract.id,
          reviewerId: req.user.id,
          reviewedId,
          ...values,
        });
      }

      // Ya está completa: impacta en el promedio del reseñado
      await updateUserRating(reviewedId);
      await clearPostWorkRatingNotification(req.user.id, contract.id.toString());

      try {
        await Notification.create({
          recipientId: reviewedId,
          type: "success",
          category: "user",
          title: "Nueva puntuación recibida",
          message: `Recibiste una puntuación de ${rating} estrellas`,
          data: { reviewId: review.id, contractId: contract.id },
          read: false,
        });
      } catch (notifErr) {
        console.warn(
          "⚠️ No se pudo crear notificación de puntuación:",
          (notifErr as any).message
        );
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
 * Puntuaciones post-trabajo sin terminar del usuario autenticado, con el
 * progreso guardado para poder retomarlas.
 *
 * GET /api/reviews/post-work/pending
 */
router.get(
  "/post-work/pending",
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const pending = await findPendingPostWorkRatings(req.user.id);
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
      // Las puntuaciones sin terminar (borradores) no son públicas
      source: { [Op.ne]: POST_WORK_DRAFT },
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

  // Los borradores (puntuaciones sin terminar) no cuentan en el promedio.
  const reviews = allReviews.filter(
    (r) => r.rating !== null && r.rating !== undefined && r.source !== POST_WORK_DRAFT
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
