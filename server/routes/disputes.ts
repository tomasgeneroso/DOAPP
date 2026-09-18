import { Router, Response } from "express";
import { getEffectiveTier } from '../services/platformPhase.js';
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
import { POLITICAS } from '../../shared/constants/policies.js';
import { estadoDelReclamo, TIPOS_DE_ACUERDO } from '../../shared/disputes/reclamo.js';
import {
  camposDeReclamoNuevo,
  mensajeDeApertura,
  proponerAcuerdo,
  rechazarAcuerdo,
  aceptarAcuerdo,
  retirarReclamo,
  escalarReclamo,
} from '../services/reclamoDirecto.js';

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

      // Un reclamo a la vez. Y si hubo uno antes, solo se puede abrir otro si
      // aquel se cerro sin que nadie decidiera nada (retirado, o acuerdo de
      // rehacer): lo que resolvio un admin o un acuerdo con plata es final.
      const anteriores = await Dispute.findAll({ where: { contractId }, attributes: ['id', 'status', 'resolutionType'] });
      const abierta = anteriores.find((d) => d.isOpen());
      if (abierta) {
        res.status(400).json({
          success: false,
          message: "Ya hay un reclamo abierto para este contrato",
          disputeId: abierta.id,
        });
        return;
      }
      const decidida = anteriores.find((d) => d.resolutionType && d.resolutionType !== 'no_action');
      if (decidida) {
        res.status(400).json({
          success: false,
          message: "Este contrato ya tuvo una disputa resuelta. La decisión es final.",
          disputeId: decidida.id,
        });
        return;
      }

      // Terminado el contrato, la ventana para disputar es la de los terminos
      // (10.7). Aca decia un mes mientras los terminos decian 7 dias: el
      // usuario firmo 7, y es lo que se aplica.
      if (contract.status === 'completed') {
        // updatedAt es la fecha en que paso a completed.
        const completedDate = new Date(contract.updatedAt);
        const limite = new Date(completedDate);
        limite.setDate(limite.getDate() + POLITICAS.DIAS_PARA_DISPUTAR);

        if (new Date() > limite) {
          res.status(400).json({
            success: false,
            message: `El período para abrir disputas ha expirado. Las disputas solo pueden abrirse hasta ${POLITICAS.DIAS_PARA_DISPUTAR} días después de la finalización del contrato.`,
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
      const effectiveTier = await getEffectiveTier(initiatingUser?.membershipTier, (initiatingUser as any)?.adminRole);
      const userIsPro = effectiveTier === 'pro' || effectiveTier === 'super_pro';

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

      // Arranca como reclamo directo (T&C 10.11): las partes tienen
      // RECLAMO_DIRECTO_HORAS para arreglarlo; despues interviene un admin.
      const reclamo = camposDeReclamoNuevo(contract);
      const dispute = await Dispute.create({
        contractId,
        paymentId: payment?.id || null,
        initiatedBy: userId,
        against: againstUserId,
        reason,
        detailedDescription: description,
        category: disputeCategory,
        evidence,
        ...reclamo,
        priority: autoPriority,
        autoPriorityReason,
        responseDeadline,
        importanceLevel,
        logs: [{
          action: 'Reclamo abierto',
          performedBy: userId,
          timestamp: new Date(),
          details: `Categoría: ${disputeCategory}. Las partes tienen ${POLITICAS.RECLAMO_DIRECTO_HORAS} h para arreglarlo (hasta ${reclamo.negotiationDeadline.toISOString()}). Prioridad si escala: ${autoPriority} (${autoPriorityReason})${evidence.length > 0 ? `. ${evidence.length} archivo(s) adjunto(s)` : ''}`,
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

      const Job = (await import('../models/sql/Job.model.js')).Job;
      const job = await Job.findByPk(contract.jobId);

      // Notify respondent: que tiene 72 h y que puede hacer.
      const aviso = mensajeDeApertura(job?.title || 'el contrato');
      await fcmService.sendToUser({
        userId: againstUserId.toString(),
        title: aviso.title,
        body: `Tenés ${POLITICAS.RECLAMO_DIRECTO_HORAS} h para responder y arreglarlo entre ustedes; si no, interviene un administrador.`,
        data: {
          type: "dispute",
          disputeId: dispute.id.toString(),
          contractId: contractId,
        },
      });
      const { Notification } = await import('../models/sql/Notification.model.js');
      await Notification.create({
        recipientId: againstUserId,
        type: 'warning',
        category: 'disputes',
        title: aviso.title,
        message: aviso.message,
        relatedModel: 'Dispute',
        relatedId: dispute.id,
        actionText: 'Responder',
        sentVia: ['in_app'],
      } as any);

      // Send email notifications
      await emailService.sendDisputeCreatedEmail(
        userId.toString(),
        againstUserId.toString(),
        dispute.id.toString(),
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

    // El reloj y los permisos del reclamo directo, calculados para quien mira.
    // El servidor es la fuente: las pantallas muestran esto, no recalculan.
    const reclamo = estadoDelReclamo(dispute as any, userId);

    res.json({
      success: true,
      data: {
        ...dispute.toJSON(),
        reclamo: {
          ...reclamo,
          horasTotales: POLITICAS.RECLAMO_DIRECTO_HORAS,
          tiposDeAcuerdo: TIPOS_DE_ACUERDO,
        },
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
 * Reclamo directo: proponer, rechazar, aceptar un acuerdo; retirar; escalar.
 * Todas devuelven la disputa recargada con el estado del reclamo.
 */
async function cargarParaParte(id: string, userId: string): Promise<{ dispute?: Dispute; error?: { status: number; message: string } }> {
  const dispute = await Dispute.findByPk(id);
  if (!dispute) return { error: { status: 404, message: 'Reclamo no encontrado' } };
  if (String(dispute.initiatedBy) !== String(userId) && String(dispute.against) !== String(userId)) {
    return { error: { status: 403, message: 'Solo las partes pueden hacer esto' } };
  }
  return { dispute };
}

async function responderConEstado(res: Response, dispute: Dispute, userId: string, message?: string) {
  await dispute.reload();
  res.json({
    success: true,
    message,
    data: { ...dispute.toJSON(), reclamo: { ...estadoDelReclamo(dispute as any, userId), horasTotales: POLITICAS.RECLAMO_DIRECTO_HORAS, tiposDeAcuerdo: TIPOS_DE_ACUERDO } },
  });
}

router.post("/:id/acuerdo", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dispute, error } = await cargarParaParte(req.params.id, req.user.id);
    if (error || !dispute) { res.status(error!.status).json({ success: false, message: error!.message }); return; }
    const r = await proponerAcuerdo(dispute, req.user.id, { tipo: req.body.tipo, monto: req.body.monto, nota: req.body.nota });
    if (!r.ok) { res.status(400).json({ success: false, message: r.motivo }); return; }
    await responderConEstado(res, dispute, req.user.id, 'Propuesta enviada. Si la otra parte acepta, se aplica en el momento.');
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

router.post("/:id/acuerdo/rechazar", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dispute, error } = await cargarParaParte(req.params.id, req.user.id);
    if (error || !dispute) { res.status(error!.status).json({ success: false, message: error!.message }); return; }
    const r = await rechazarAcuerdo(dispute, req.user.id, req.body.nota);
    if (!r.ok) { res.status(400).json({ success: false, message: r.motivo }); return; }
    await responderConEstado(res, dispute, req.user.id, 'Propuesta rechazada. Pueden seguir conversando o pedir que intervenga un administrador.');
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

router.post("/:id/acuerdo/aceptar", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dispute, error } = await cargarParaParte(req.params.id, req.user.id);
    if (error || !dispute) { res.status(error!.status).json({ success: false, message: error!.message }); return; }
    const r = await aceptarAcuerdo(dispute, req.user.id);
    if (!r.ok) { res.status(400).json({ success: false, message: r.motivo }); return; }
    await responderConEstado(res, dispute, req.user.id, 'Acuerdo aplicado. El reclamo quedó cerrado.');
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

router.post("/:id/retirar", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dispute, error } = await cargarParaParte(req.params.id, req.user.id);
    if (error || !dispute) { res.status(error!.status).json({ success: false, message: error!.message }); return; }
    const r = await retirarReclamo(dispute, req.user.id, req.body.nota);
    if (!r.ok) { res.status(400).json({ success: false, message: r.motivo }); return; }
    await responderConEstado(res, dispute, req.user.id, 'Reclamo retirado. El contrato sigue como estaba.');
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

router.post("/:id/escalar", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dispute, error } = await cargarParaParte(req.params.id, req.user.id);
    if (error || !dispute) { res.status(error!.status).json({ success: false, message: error!.message }); return; }
    const r = await escalarReclamo(dispute, { userId: req.user.id });
    if (!r.ok) { res.status(400).json({ success: false, message: r.motivo }); return; }
    await responderConEstado(res, dispute, req.user.id, 'Un administrador va a revisar el reclamo.');
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * Las pruebas del contrato agrupadas por detalle obligatorio (las tareas del
 * trabajo, cada una con sus fotos y si fue reclamada) y por dia (las fotos del
 * control diario). Es lo que un admin, o la otra parte, necesita mirar para
 * decidir: no una grilla de fotos sueltas sino "este detalle, estas fotos".
 * GET /api/disputes/:id/pruebas
 */
router.get("/:id/pruebas", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dispute = await Dispute.findByPk(req.params.id, { attributes: ['id', 'contractId', 'initiatedBy', 'against'] });
    if (!dispute) { res.status(404).json({ success: false, message: 'Disputa no encontrada' }); return; }
    const userId = String(req.user.id);
    const isAdmin = !!req.user.adminRole && ['owner', 'super_admin', 'admin', 'moderator', 'support'].includes(req.user.adminRole);
    if (!isAdmin && String(dispute.initiatedBy) !== userId && String(dispute.against) !== userId) {
      res.status(403).json({ success: false, message: 'No tienes permiso para ver esta disputa' });
      return;
    }

    const contract = await Contract.findByPk(dispute.contractId);
    if (!contract) { res.status(404).json({ success: false, message: 'Contrato no encontrado' }); return; }

    const { JobTask } = await import('../models/sql/JobTask.model.js');
    const tareas = await JobTask.findAll({
      where: { jobId: contract.jobId },
      order: [['orderIndex', 'ASC']],
      include: [{ model: User, as: 'claimer', attributes: ['id', 'name'] }],
    });

    const { buildDailyLog } = await import('../services/dailyLog.js');
    const quienMira: 'client' | 'worker' = String(contract.clientId) === userId ? 'client' : 'worker';
    const diario = buildDailyLog(contract, quienMira);

    res.json({
      success: true,
      data: {
        detalles: tareas.map((t: any) => ({
          id: t.id,
          titulo: t.title,
          descripcion: t.description || null,
          estado: t.status,
          completadoEl: t.completedAt || null,
          reclamado: !!t.isClaimed,
          reclamadoEl: t.claimedAt || null,
          reclamadoPor: t.claimer ? { id: t.claimer.id, name: t.claimer.name } : null,
          notaDelReclamo: t.claimNotes || null,
          fotos: Array.isArray(t.evidencePhotos) ? t.evidencePhotos : [],
          fotosSubidasEl: t.evidenceUploadedAt || null,
        })),
        porDia: diario.dias
          .filter((d) => d.adjuntos.length > 0 || d.estado !== 'sin_marcar')
          .map((d) => ({ fecha: d.date, estado: d.estado, adjuntos: d.adjuntos })),
        resumenDiario: { confirmados: diario.confirmados, total: diario.total },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
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
          { model: User, as: 'initiator', attributes: ['name', 'avatar', 'email'] },
          { model: User, as: 'defendant', attributes: ['name', 'avatar', 'email'] },
        ],
      });

      // Send email notification to the other party
      const sender = await User.findByPk(userId);
      const recipientId = dispute.initiatedBy === userId ? dispute.against : dispute.initiatedBy;
      const recipient = await User.findByPk(recipientId);

      if (recipient?.email && sender && message) {
        await emailService.sendDisputeMessageEmail(
          id,
          recipient.email,
          recipient.name,
          sender.name,
          message,
          isAdmin
        );
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
