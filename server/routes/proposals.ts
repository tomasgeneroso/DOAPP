import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import Proposal from "../models/Proposal.js";
import Job from "../models/Job.js";
import Contract from "../models/Contract.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";

const router = express.Router();

// @route   GET /api/proposals
// @desc    Obtener propuestas del usuario (enviadas o recibidas)
// @access  Private
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type } = req.query;

    let query: any = {};

    // type: 'sent' (propuestas enviadas) o 'received' (propuestas recibidas)
    if (type === "sent") {
      query.freelancer = req.user._id;
    } else if (type === "received") {
      query.client = req.user._id;
    } else {
      // Por defecto, mostrar todas las propuestas relacionadas con el usuario
      query.$or = [{ freelancer: req.user._id }, { client: req.user._id }];
    }

    if (status) {
      query.status = status;
    }

    const proposals = await Proposal.find(query)
      .populate("job", "title summary price location category")
      .populate("freelancer", "name avatar rating reviewsCount completedJobs")
      .populate("client", "name avatar")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/proposals/job/:jobId
// @desc    Obtener propuestas de un trabajo específico
// @access  Private
router.get("/job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.jobId);

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
        message: "No tienes permiso para ver las propuestas de este trabajo",
      });
      return;
    }

    const proposals = await Proposal.find({ job: req.params.jobId })
      .populate("freelancer", "name avatar rating reviewsCount completedJobs")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/proposals/:id
// @desc    Obtener propuesta por ID
// @access  Private
router.get("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate("job")
      .populate("freelancer", "name email avatar rating reviewsCount completedJobs")
      .populate("client", "name email avatar");

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea parte de la propuesta
    const isFreelancer = proposal.freelancer._id.toString() === req.user._id.toString();
    const isClient = proposal.client._id.toString() === req.user._id.toString();

    if (!isFreelancer && !isClient) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta propuesta",
      });
      return;
    }

    res.json({
      success: true,
      proposal,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/proposals
// @desc    Enviar propuesta a un trabajo
// @access  Private
router.post(
  "/",
  protect,
  [
    body("job").notEmpty().withMessage("El trabajo es requerido"),
    body("coverLetter")
      .notEmpty()
      .withMessage("La carta de presentación es requerida")
      .isLength({ max: 1000 })
      .withMessage("La carta no puede exceder 1000 caracteres"),
    body("proposedPrice")
      .isNumeric()
      .withMessage("El precio debe ser un número")
      .custom((value) => value >= 0)
      .withMessage("El precio no puede ser negativo"),
    body("estimatedDuration")
      .isInt({ min: 1 })
      .withMessage("La duración debe ser al menos 1 día"),
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

      const { job: jobId, coverLetter, proposedPrice, estimatedDuration } = req.body;

      // Verificar que el trabajo existe y está abierto
      const job = await Job.findById(jobId);
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
          message: "Este trabajo ya no está abierto para propuestas",
        });
        return;
      }

      // Verificar que el usuario no sea el dueño del trabajo
      if (job.client.toString() === req.user._id.toString()) {
        res.status(400).json({
          success: false,
          message: "No puedes enviar una propuesta a tu propio trabajo",
        });
        return;
      }

      // Verificar que no haya enviado una propuesta previamente
      const existingProposal = await Proposal.findOne({
        job: jobId,
        freelancer: req.user._id,
      });

      if (existingProposal) {
        res.status(400).json({
          success: false,
          message: "Ya has enviado una propuesta para este trabajo",
        });
        return;
      }

      // Crear propuesta
      const proposal = await Proposal.create({
        job: jobId,
        freelancer: req.user._id,
        client: job.client,
        coverLetter,
        proposedPrice,
        estimatedDuration,
      });

      const populatedProposal = await Proposal.findById(proposal._id)
        .populate("job", "title summary price location")
        .populate("freelancer", "name avatar rating reviewsCount")
        .populate("client", "name avatar");

      res.status(201).json({
        success: true,
        proposal: populatedProposal,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/proposals/:id/approve
// @desc    Aprobar propuesta (por el cliente)
// @access  Private
router.put("/:id/approve", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate("job");

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea el cliente
    if (proposal.client.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede aprobar esta propuesta",
      });
      return;
    }

    if (proposal.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Esta propuesta no puede ser aprobada",
      });
      return;
    }

    // Actualizar propuesta
    proposal.status = "approved";
    await proposal.save();

    // Rechazar todas las demás propuestas del mismo trabajo
    await Proposal.updateMany(
      {
        job: proposal.job._id,
        _id: { $ne: proposal._id },
        status: "pending",
      },
      {
        status: "rejected",
        rejectionReason: "Se aprobó otra propuesta",
      }
    );

    // Actualizar trabajo
    const job = await Job.findById(proposal.job._id);
    if (job) {
      job.status = "in_progress";
      job.doer = proposal.freelancer;
      await job.save();
    }

    // Crear contrato automáticamente
    const PLATFORM_COMMISSION = 0.1;
    const commission = proposal.proposedPrice * PLATFORM_COMMISSION;
    const totalPrice = proposal.proposedPrice + commission;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + proposal.estimatedDuration);

    await Contract.create({
      job: proposal.job._id,
      client: proposal.client,
      doer: proposal.freelancer,
      type: "trabajo",
      price: proposal.proposedPrice,
      commission,
      totalPrice,
      startDate,
      endDate,
      status: "pending",
      termsAccepted: false,
      termsAcceptedByClient: false,
      termsAcceptedByDoer: false,
    });

    res.json({
      success: true,
      proposal,
      message: "Propuesta aprobada y contrato creado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/proposals/:id/reject
// @desc    Rechazar propuesta (por el cliente)
// @access  Private
router.put(
  "/:id/reject",
  protect,
  [body("rejectionReason").optional().isLength({ max: 500 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rejectionReason } = req.body;

      const proposal = await Proposal.findById(req.params.id);

      if (!proposal) {
        res.status(404).json({
          success: false,
          message: "Propuesta no encontrada",
        });
        return;
      }

      // Verificar que el usuario sea el cliente
      if (proposal.client.toString() !== req.user._id.toString()) {
        res.status(403).json({
          success: false,
          message: "Solo el cliente puede rechazar esta propuesta",
        });
        return;
      }

      if (proposal.status !== "pending") {
        res.status(400).json({
          success: false,
          message: "Esta propuesta no puede ser rechazada",
        });
        return;
      }

      proposal.status = "rejected";
      proposal.rejectionReason = rejectionReason;
      await proposal.save();

      res.json({
        success: true,
        proposal,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/proposals/:id/withdraw
// @desc    Retirar propuesta (por el freelancer)
// @access  Private
router.put(
  "/:id/withdraw",
  protect,
  [body("withdrawnReason").optional().isLength({ max: 500 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { withdrawnReason } = req.body;

      const proposal = await Proposal.findById(req.params.id);

      if (!proposal) {
        res.status(404).json({
          success: false,
          message: "Propuesta no encontrada",
        });
        return;
      }

      // Verificar que el usuario sea el freelancer
      if (proposal.freelancer.toString() !== req.user._id.toString()) {
        res.status(403).json({
          success: false,
          message: "Solo el freelancer puede retirar esta propuesta",
        });
        return;
      }

      if (proposal.status !== "pending") {
        res.status(400).json({
          success: false,
          message: "Esta propuesta no puede ser retirada",
        });
        return;
      }

      proposal.status = "withdrawn";
      proposal.withdrawnReason = withdrawnReason;
      await proposal.save();

      res.json({
        success: true,
        proposal,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   DELETE /api/proposals/:id
// @desc    Eliminar propuesta (solo si está pending y es el freelancer)
// @access  Private
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findById(req.params.id);

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea el freelancer
    if (proposal.freelancer.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar esta propuesta",
      });
      return;
    }

    if (proposal.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Solo puedes eliminar propuestas pendientes",
      });
      return;
    }

    await proposal.deleteOne();

    res.json({
      success: true,
      message: "Propuesta eliminada",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
