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
    body("contractId").isUUID().withMessage("ID de contrato inválido"),
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

      // Check if contract is completed and within 1 month dispute window
      if (contract.status === 'completed') {
        // Use updatedAt as the completion date (when status changed to completed)
        const completedDate = new Date(contract.updatedAt);
        const oneMonthLater = new Date(completedDate);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        if (new Date() > oneMonthLater) {
          res.status(400).json({
            success: false,
            message: "El período para abrir disputas ha expirado. Las disputas solo pueden abrirse dentro de 1 mes desde la finalización del contrato.",
          });
          return;
        }
      }

      // Find payment (may not exist for contracts without escrow/payment)
      const payment = await Payment.findOne({ where: { contractId } });

      // Determine respondent
      const againstUserId =
        contract.clientId === userId ? contract.doerId : contract.clientId;

      // Check if initiating user is PRO
      const initiatingUser = await User.findByPk(userId);
      const userIsPro = initiatingUser?.membershipTier === 'pro' || initiatingUser?.membershipTier === 'super_pro';

      // Calculate automatic priority based on contract value and category
      const disputeCategory = category || 'other';
      const { priority: autoPriority, reason: autoPriorityReason } = Dispute.determineAutoPriority(
        Number(contract.price),
        disputeCategory,
        userIsPro
      );

      // Calculate response deadline based on priority
      const responseDeadline = Dispute.calculateResponseDeadline(autoPriority);

      // Determine importance level based on priority
      let importanceLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (autoPriority === 'urgent') importanceLevel = 'critical';
      else if (autoPriority === 'high') importanceLevel = 'high';
      else if (autoPriority === 'low') importanceLevel = 'low';

      // Create dispute
      const dispute = await Dispute.create({
        contractId,
        paymentId: payment?.id || null,
        initiatedBy: userId,
        against: againstUserId,
        reason,
        detailedDescription: description,
        category: disputeCategory,
        evidence,
        status: 'open',
        priority: autoPriority,
        autoPriorityReason,
        responseDeadline,
        importanceLevel,
        logs: [{
          action: 'Disputa creada',
          performedBy: userId,
          timestamp: new Date(),
          details: `Categoría: ${disputeCategory}. Prioridad automática: ${autoPriority} (${autoPriorityReason})${evidence.length > 0 ? `. ${evidence.length} archivo(s) adjunto(s)` : ''}`,
        }],
      });

      // Update contract status
      contract.status = "disputed";
      contract.disputeId = dispute.id;
      contract.disputedAt = new Date();
      await contract.save();

      // Update payment status if payment exists
      if (payment) {
        payment.status = 'disputed';
        payment.disputeId = dispute.id;
        payment.disputedAt = new Date();
        payment.disputedBy = userId;
        await payment.save();
      }

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
 * Get user's disputes with full details (for My Disputes page)
 * GET /api/disputes/my-disputes
 */
router.get("/my-disputes", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { status, category, page = 1, limit = 50 } = req.query;

    const query: any = {
      [Op.or]: [{ initiatedBy: userId }, { against: userId }],
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    const Job = (await import('../models/sql/Job.model.js')).Job;

    const disputes = await Dispute.findAll({
      where: query,
      include: [
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'price', 'status', 'jobId'],
          include: [
            {
              model: Job,
              as: 'job',
              attributes: ['id', 'title'],
            }
          ]
        },
        {
          model: User,
          as: 'initiator',
          attributes: ['id', 'name', 'avatar'],
        },
        {
          model: User,
          as: 'defendant',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    // Format data for frontend with message count
    const formattedDisputes = disputes.map(dispute => {
      const contractData = dispute.contract as any;
      return {
        id: dispute.id,
        category: dispute.category,
        priority: dispute.priority,
        status: dispute.status,
        reason: dispute.reason,
        detailedDescription: dispute.detailedDescription,
        createdAt: dispute.createdAt,
        updatedAt: dispute.updatedAt,
        importanceLevel: dispute.importanceLevel,
        contract: contractData ? {
          id: contractData.id,
          title: contractData.job?.title || `Contrato #${contractData.id.slice(0, 8)}`,
          price: contractData.price,
        } : null,
        initiator: dispute.initiator,
        defendant: dispute.defendant,
        messagesCount: dispute.messages?.length || 0,
        evidenceCount: dispute.evidence?.length || 0,
      };
    });

    const total = await Dispute.count({ where: query });

    res.json({
      success: true,
      data: formattedDisputes,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error('Error loading user disputes:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get all disputes (for user)
 * GET /api/disputes
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const query: any = {
      [Op.or]: [{ initiatedBy: userId }, { against: userId }],
    };

    if (status) {
      query.status = status;
    }

    const Job = (await import('../models/sql/Job.model.js')).Job;

    const disputes = await Dispute.findAll({
      where: query,
      include: [
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'price', 'status', 'jobId'],
          include: [
            {
              model: Job,
              as: 'job',
              attributes: ['id', 'title'],
            }
          ]
        },
        {
          model: User,
          as: 'initiator',
          attributes: ['name', 'avatar'],
        },
        {
          model: User,
          as: 'defendant',
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
          as: 'defendant',
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

    // Verify user is a participant OR an admin
    const isParticipant =
      dispute.initiatedBy === userId ||
      dispute.against === userId;

    const isAdmin = req.user.adminRole && ['owner', 'super_admin', 'admin', 'moderator', 'support'].includes(req.user.adminRole);

    if (!isParticipant && !isAdmin) {
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
 * Add message to dispute (with optional attachments)
 * POST /api/disputes/:id/messages
 */
router.post(
  "/:id/messages",
  protect,
  uploadDisputeAttachments,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { message } = req.body;
      const files = (req as any).files as Express.Multer.File[];

      if (!message && (!files || files.length === 0)) {
        res.status(400).json({
          success: false,
          message: "El mensaje o un archivo adjunto es requerido",
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

      // Check if user is a participant OR an admin
      const isParticipant =
        dispute.initiatedBy === userId ||
        dispute.against === userId;

      const isAdmin = req.user.adminRole && ['owner', 'super_admin', 'admin', 'moderator', 'support'].includes(req.user.adminRole);

      if (!isParticipant && !isAdmin) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para comentar en esta disputa",
        });
        return;
      }

      // Process attachments if any
      const attachments = files && files.length > 0 ? files.map((file) => {
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
      }) : undefined;

      // Use spread to create new array - Sequelize doesn't detect JSONB mutations
      dispute.messages = [
        ...dispute.messages,
        {
          from: userId,
          message: message || '',
          attachments,
          isAdmin: isAdmin || false,
          createdAt: new Date(),
        }
      ];
      dispute.changed('messages', true);

      await dispute.save();

      // Track analytics event
      await disputeAnalytics.trackDisputeEvent('message_added', id, {
        messageLength: message?.length || 0,
        hasAttachments: !!(attachments && attachments.length > 0),
      });

      // Reload with associations
      await dispute.reload({
        include: [
          { model: User, as: 'initiator', attributes: ['name', 'avatar'] },
          { model: User, as: 'defendant', attributes: ['name', 'avatar'] },
        ],
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
        dispute.initiatedBy === userId ||
        dispute.against === userId;

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

      // Add evidence to dispute - use spread to ensure Sequelize detects change
      dispute.evidence = [...dispute.evidence, ...evidence];
      dispute.changed('evidence', true);

      // Add log entry
      dispute.logs = [
        ...dispute.logs,
        {
          action: `${files.length} archivo(s) subido(s)`,
          performedBy: userId,
          timestamp: new Date(),
          details: `Tipos: ${evidence.map((a) => a.fileType).join(", ")}`,
        }
      ];
      dispute.changed('logs', true);

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
