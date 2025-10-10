import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import Dispute from "../models/Dispute";
import Contract from "../models/Contract";
import { body, validationResult } from "express-validator";
import fcmService from "../services/fcm";
import emailService from "../services/email";

const router = Router();

/**
 * Create a dispute
 * POST /api/disputes
 */
router.post(
  "/",
  protect,
  [
    body("contractId").isMongoId().withMessage("ID de contrato inválido"),
    body("reason").notEmpty().withMessage("El motivo es requerido"),
    body("description").notEmpty().withMessage("La descripción es requerida"),
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

      const userId = req.user._id;
      const { contractId, reason, description, evidence } = req.body;

      // Verify contract exists and user is a participant
      const contract = await Contract.findById(contractId);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      const isParticipant =
        contract.client.toString() === userId.toString() ||
        contract.doer.toString() === userId.toString();

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No eres parte de este contrato",
        });
        return;
      }

      // Check if dispute already exists
      const existingDispute = await Dispute.findOne({ contractId });

      if (existingDispute) {
        res.status(400).json({
          success: false,
          message: "Ya existe una disputa para este contrato",
        });
        return;
      }

      // Determine respondent
      const respondent =
        contract.client.toString() === userId.toString() ? contract.doer : contract.client;

      // Create dispute
      const dispute = await Dispute.create({
        contractId,
        initiatedBy: userId,
        respondent,
        reason,
        description,
        evidence: evidence || [],
      });

      // Update contract status
      contract.status = "disputed";
      await contract.save();

      // Notify respondent
      await fcmService.sendToUser({
        userId: respondent.toString(),
        title: "Nueva disputa",
        body: `Se ha abierto una disputa para el contrato: ${contract.title}`,
        data: {
          type: "dispute",
          disputeId: dispute._id.toString(),
          contractId: contractId,
        },
      });

      res.status(201).json({
        success: true,
        data: dispute,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get all disputes (for user)
 * GET /api/disputes
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    const query: any = {
      $or: [{ initiatedBy: userId }, { respondent: userId }],
    };

    if (status) {
      query.status = status;
    }

    const disputes = await Dispute.find(query)
      .populate("contractId", "title")
      .populate("initiatedBy", "name avatar")
      .populate("respondent", "name avatar")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Dispute.countDocuments(query);

    res.json({
      success: true,
      data: disputes,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get dispute by ID
 * GET /api/disputes/:id
 */
router.get("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const dispute = await Dispute.findById(id)
      .populate("contractId")
      .populate("initiatedBy", "name avatar")
      .populate("respondent", "name avatar")
      .populate("resolvedBy", "name")
      .populate("messages.userId", "name avatar");

    if (!dispute) {
      res.status(404).json({
        success: false,
        message: "Disputa no encontrada",
      });
      return;
    }

    // Verify user is a participant
    const isParticipant =
      dispute.initiatedBy._id.toString() === userId.toString() ||
      dispute.respondent._id.toString() === userId.toString();

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta disputa",
      });
      return;
    }

    res.json({
      success: true,
      data: dispute,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Add message to dispute
 * POST /api/disputes/:id/messages
 */
router.post(
  "/:id/messages",
  protect,
  [body("message").notEmpty().withMessage("El mensaje es requerido")],
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
      const userId = req.user._id;
      const { message } = req.body;

      const dispute = await Dispute.findById(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Verify user is a participant
      const isParticipant =
        dispute.initiatedBy.toString() === userId.toString() ||
        dispute.respondent.toString() === userId.toString();

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para comentar en esta disputa",
        });
        return;
      }

      dispute.messages.push({
        userId,
        message,
        createdAt: new Date(),
      });

      await dispute.save();

      res.json({
        success: true,
        data: dispute,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Add evidence to dispute
 * POST /api/disputes/:id/evidence
 */
router.post(
  "/:id/evidence",
  protect,
  [
    body("type").isIn(["image", "document", "link"]).withMessage("Tipo de evidencia inválido"),
    body("url").notEmpty().withMessage("La URL es requerida"),
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

      const { id } = req.params;
      const userId = req.user._id;
      const { type, url, description } = req.body;

      const dispute = await Dispute.findById(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Verify user is a participant
      const isParticipant =
        dispute.initiatedBy.toString() === userId.toString() ||
        dispute.respondent.toString() === userId.toString();

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para añadir evidencia a esta disputa",
        });
        return;
      }

      dispute.evidence.push({
        type,
        url,
        description,
      });

      await dispute.save();

      res.json({
        success: true,
        data: dispute,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

export default router;
