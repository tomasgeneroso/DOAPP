import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { Dispute } from "../models/sql/Dispute.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { User } from "../models/sql/User.model.js";
import { body, validationResult } from "express-validator";
import fcmService from "../services/fcm.js";
import emailService from "../services/email.js";
import { uploadDisputeAttachments, getFileUrl } from "../middleware/upload.js";
import disputeAnalytics from "../services/disputeAnalytics.js";
import { addBreadcrumb } from "../config/sentry.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { PERMISSIONS } from "../config/permissions.js";
import { Op } from 'sequelize';

const router = Router();

/**
 * Create a dispute
 * POST /api/disputes
 */
router.post(
  "/",
  protect,
  checkPermission(PERMISSIONS.DISPUTE_CREATE),
  uploadDisputeAttachments,
  [
    body("contractId").isInt().withMessage("ID de contrato inválido"),
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

      const userId = req.user.id;
      const { contractId, reason, description, category } = req.body;
      const files = (req as any).files as Express.Multer.File[];

      // Process uploaded files
      const evidence = files && files.length > 0 ? files.map((file) => {
        let fileType: "image" | "video" | "pdf" | "other" = "other";

        if (file.mimetype.startsWith("image/")) {
          fileType = "image";
        } else if (file.mimetype.startsWith("video/")) {
          fileType = "video";
        } else if (file.mimetype === "application/pdf") {
          fileType = "pdf";
        }

        return {
          fileName: file.originalname,
          fileUrl: getFileUrl(file.path, req),
          fileType,
          fileSize: file.size,
          uploadedAt: new Date(),
        };
      }) : [];

      // Verify contract exists and user is a participant
      const contract = await Contract.findByPk(contractId);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      const isParticipant =
        contract.clientId === userId ||
        contract.doerId === userId;

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No eres parte de este contrato",
        });
        return;
      }

      // Check if dispute already exists
      const existingDispute = await Dispute.findOne({ where: { contractId } });

      if (existingDispute) {
        res.status(400).json({
          success: false,
          message: "Ya existe una disputa para este contrato",
        });
        return;
      }

      // Find payment
      const payment = await Payment.findOne({ where: { contractId } });
      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Pago no encontrado",
        });
        return;
      }

      // Determine respondent
      const againstUserId =
        contract.clientId === userId ? contract.doerId : contract.clientId;

      // Create dispute
      const dispute = await Dispute.create({
        contractId,
        paymentId: payment.id,
        initiatedById: userId,
        againstId: againstUserId,
        reason,
        detailedDescription: description,
        category: category || 'other',
        evidence,
        status: 'open',
        priority: 'medium',
        importanceLevel: 'medium',
        logs: [{
          action: 'Disputa creada',
          performedBy: userId,
          timestamp: new Date(),
          details: `Categoría: ${category || 'other'}${evidence.length > 0 ? `, ${evidence.length} archivo(s) adjunto(s)` : ''}`,
        }],
      });

      // Update contract status
      contract.status = "disputed";
      contract.disputeId = dispute.id;
      contract.disputedAt = new Date();
      await contract.save();

      // Update payment status
      payment.status = 'disputed';
      payment.disputeId = dispute.id;
      payment.disputedAt = new Date();
      payment.disputedById = userId;
      await payment.save();

      // Notify respondent
      await fcmService.sendToUser({
        userId: againstUserId.toString(),
        title: "Nueva disputa",
        body: `Se ha abierto una disputa para un contrato`,
        data: {
          type: "dispute",
          disputeId: dispute.id.toString(),
          contractId: contractId,
        },
      });

      // Send email notifications
      const Job = (await import('../models/sql/Job.model.js')).Job;
      const job = await Job.findByPk(contract.jobId);
      await emailService.sendDisputeCreatedEmail(
        dispute.id.toString(),
        userId.toString(),
        againstUserId.toString(),
        contractId,
        job?.title || 'Contrato',
        reason
      );

      // Track analytics event
      await disputeAnalytics.trackDisputeEvent('created', dispute.id.toString(), {
        category: category || 'other',
        evidenceCount: evidence.length,
        contractValue: contract.price,
      });

      addBreadcrumb('Dispute created', 'dispute', 'info', {
        disputeId: dispute.id.toString(),
        contractId,
        category: category || 'other',
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
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const query: any = {
      [Op.or]: [{ initiatedById: userId }, { againstId: userId }],
    };

    if (status) {
      query.status = status;
    }

    const disputes = await Dispute.findAll({
      where: query,
      include: [
        {
          model: Contract,
          as: 'contract',
          attributes: ['title'],
        },
        {
          model: User,
          as: 'initiator',
          attributes: ['name', 'avatar'],
        },
        {
          model: User,
          as: 'respondent',
          attributes: ['name', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    const total = await Dispute.count({ where: query });

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
    const userId = req.user.id;

    const dispute = await Dispute.findByPk(id, {
      include: [
        {
          model: Contract,
          as: 'contract',
        },
        {
          model: User,
          as: 'initiator',
          attributes: ['name', 'avatar'],
        },
        {
          model: User,
          as: 'respondent',
          attributes: ['name', 'avatar'],
        },
        {
          model: User,
          as: 'resolver',
          attributes: ['name'],
        },
      ],
    });

    if (!dispute) {
      res.status(404).json({
        success: false,
        message: "Disputa no encontrada",
      });
      return;
    }

    // Verify user is a participant
    const isParticipant =
      dispute.initiatedById === userId ||
      dispute.againstId === userId;

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
      const userId = req.user.id;
      const { message } = req.body;

      const dispute = await Dispute.findByPk(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Verify user is a participant
      const isParticipant =
        dispute.initiatedById === userId ||
        dispute.againstId === userId;

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para comentar en esta disputa",
        });
        return;
      }

      dispute.messages.push({
        from: userId,
        message,
        createdAt: new Date(),
      });

      await dispute.save();

      // Track analytics event
      await disputeAnalytics.trackDisputeEvent('message_added', id, {
        messageLength: message.length,
      });

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
 * Upload evidence to dispute (images, videos, documents)
 * POST /api/disputes/:id/evidence
 */
router.post(
  "/:id/evidence",
  protect,
  uploadDisputeAttachments,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const files = (req as any).files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          message: "No se subieron archivos",
        });
        return;
      }

      const dispute = await Dispute.findByPk(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Verify user is a participant
      const isParticipant =
        dispute.initiatedById === userId ||
        dispute.againstId === userId;

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para añadir archivos a esta disputa",
        });
        return;
      }

      // Process uploaded files
      const evidence = files.map((file) => {
        let fileType: "image" | "video" | "pdf" | "other" = "other";

        if (file.mimetype.startsWith("image/")) {
          fileType = "image";
        } else if (file.mimetype.startsWith("video/")) {
          fileType = "video";
        } else if (file.mimetype === "application/pdf") {
          fileType = "pdf";
        }

        return {
          fileName: file.originalname,
          fileUrl: getFileUrl(file.path, req),
          fileType,
          fileSize: file.size,
          uploadedAt: new Date(),
        };
      });

      // Add evidence to dispute
      dispute.evidence.push(...evidence);

      // Add log entry
      dispute.logs.push({
        action: `${files.length} archivo(s) subido(s)`,
        performedBy: userId,
        timestamp: new Date(),
        details: `Tipos: ${evidence.map((a) => a.fileType).join(", ")}`,
      });

      await dispute.save();

      // Track analytics event
      await disputeAnalytics.trackDisputeEvent('evidence_added', id, {
        filesCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      });

      res.json({
        success: true,
        message: `${files.length} archivo(s) subido(s) correctamente`,
        data: {
          evidence,
          dispute,
        },
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
