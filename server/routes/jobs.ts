import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import Job from "../models/Job.js";
import Conversation from "../models/Conversation.js";
import Notification from "../models/Notification.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";

const router = express.Router();

// @route   GET /api/jobs
// @desc    Obtener todos los trabajos
// @access  Public
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, category, minPrice, maxPrice, limit = "20" } = req.query;

    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const jobs = await Job.find(query)
      .populate("client", "name avatar rating reviewsCount")
      .populate("doer", "name avatar rating reviewsCount")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      count: jobs.length,
      jobs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/jobs/:id
// @desc    Obtener trabajo por ID
// @access  Public
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("client", "name avatar rating reviewsCount phone email")
      .populate("doer", "name avatar rating reviewsCount phone");

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs
// @desc    Crear nuevo trabajo
// @access  Private
router.post(
  "/",
  protect,
  [
    body("title").trim().notEmpty().withMessage("El título es requerido"),
    body("summary").trim().notEmpty().withMessage("El resumen es requerido"),
    body("description").trim().notEmpty().withMessage("La descripción es requerida"),
    body("price").isNumeric().withMessage("El precio debe ser un número"),
    body("location").trim().notEmpty().withMessage("La ubicación es requerida"),
    body("startDate").isISO8601().withMessage("Fecha de inicio inválida"),
    body("endDate").isISO8601().withMessage("Fecha de fin inválida"),
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

      const jobData = {
        ...req.body,
        client: req.user._id,
      };

      const job = await Job.create(jobData);

      res.status(201).json({
        success: true,
        job,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/jobs/:id
// @desc    Actualizar trabajo
// @access  Private
router.put("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let job = await Job.findById(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea el dueño del trabajo
    if (job.client.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para actualizar este trabajo",
      });
      return;
    }

    job = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Eliminar trabajo
// @access  Private
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea el dueño del trabajo
    if (job.client.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar este trabajo",
      });
      return;
    }

    await job.deleteOne();

    res.json({
      success: true,
      message: "Trabajo eliminado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs/:id/start-conversation
// @desc    Iniciar conversación con el creador del trabajo
// @access  Private
router.post("/:id/start-conversation", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id).populate("client", "name");

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Check if user is trying to message themselves
    if (job.client._id.toString() === req.user._id.toString()) {
      res.status(400).json({
        success: false,
        message: "No puedes iniciar una conversación contigo mismo",
      });
      return;
    }

    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, job.client._id] },
      type: "direct",
    });

    if (!conversation) {
      // Create new conversation
      conversation = await Conversation.create({
        participants: [req.user._id, job.client._id],
        type: "direct",
        jobId: job._id,
      });

      // Create notification for job owner
      await Notification.create({
        recipient: job.client._id,
        type: "info",
        category: "user",
        title: "Nueva solicitud de trabajo",
        message: `${req.user.name} está interesado en tu trabajo: ${job.title}`,
        relatedModel: "Job",
        relatedId: job._id,
        actionUrl: `/chat/${conversation._id}`,
        actionText: "Ver conversación",
        sentVia: ["in_app"],
      });
    }

    res.json({
      success: true,
      conversationId: conversation._id,
      message: "Conversación iniciada",
    });
  } catch (error: any) {
    console.error("Start conversation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/jobs/:id/apply
// @desc    Aplicar a un trabajo
// @access  Private
router.put("/:id/apply", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    if (job.status !== "open") {
      res.status(400).json({
        success: false,
        message: "Este trabajo ya no está disponible",
      });
      return;
    }

    if (job.doer) {
      res.status(400).json({
        success: false,
        message: "Este trabajo ya tiene un doer asignado",
      });
      return;
    }

    job.doer = req.user._id;
    job.status = "in_progress";
    await job.save();

    res.json({
      success: true,
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
