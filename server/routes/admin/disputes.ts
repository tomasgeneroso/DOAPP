import { Router, Response } from "express";
import { resolverDisputa } from '../../services/disputeResolution.js';
import { protect, authorize, AuthRequest } from "../../middleware/auth.js";
import { Dispute } from "../../models/sql/Dispute.model.js";
import { User } from "../../models/sql/User.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { body, validationResult } from "express-validator";
import { logAudit } from "../../utils/auditLog.js";
import emailService from "../../services/email.js";
import mercadopagoService from "../../services/mercadopago.js";
import { Op } from 'sequelize';

const router = Router();

/**
 * Get all disputes (Admin only)
 * GET /api/admin/disputes
 */
router.get(
  "/",
  protect,
  authorize("owner", "super_admin", "moderator", "support"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, priority, contractId, page = 1, limit = 20 } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (contractId) where.contractId = contractId;

      const disputes = await Dispute.findAll({
        where,
        include: [
          { model: Contract, as: "contract", attributes: ["price"] },
          { model: Payment, as: "payment", attributes: ["id", "status", "amount"] },
          { model: User, as: "initiator", attributes: ["name", "email", "avatar"] },
          { model: User, as: "defendant", attributes: ["name", "email", "avatar"] },
          { model: User, as: "assignee", attributes: ["name"] },
          { model: User, as: "resolver", attributes: ["name"] },
        ],
        order: [["createdAt", "DESC"]],
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
      });

      // Add hasPayment flag for admin visibility
      const disputesWithPaymentFlag = disputes.map(d => {
        const plain = d.toJSON();
        return {
          ...plain,
          hasPayment: !!plain.payment,
        };
      });

      const total = await Dispute.count({ where });

      res.json({
        success: true,
        data: disputesWithPaymentFlag,
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
  }
);

/**
 * Get dispute by ID (Admin only)
 * GET /api/admin/disputes/:id
 */
router.get(
  "/:id",
  protect,
  authorize("owner", "super_admin", "moderator", "support"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const dispute = await Dispute.findByPk(id, {
        include: [
          { model: Contract, as: "contract" },
          { model: Payment, as: "payment" },
          { model: User, as: "initiator", attributes: ["name", "email", "phone", "avatar"] },
          { model: User, as: "defendant", attributes: ["name", "email", "phone", "avatar"] },
          { model: User, as: "assignee", attributes: ["name", "email"] },
          { model: User, as: "resolver", attributes: ["name", "email"] },
        ],
      });

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
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
  }
);

/**
 * Assign dispute to admin (Admin only)
 * PUT /api/admin/disputes/:id/assign
 */
router.put(
  "/:id/assign",
  protect,
  authorize("owner", "super_admin", "moderator"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { assignedTo } = req.body;

      const dispute = await Dispute.findByPk(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      const currentLogs = dispute.logs || [];
      const newLog = {
        action: `Disputa asignada`,
        performedBy: req.user.id,
        timestamp: new Date(),
        details: `Asignado a admin ${assignedTo}`,
      };

      await dispute.update({
        assignedTo,
        assignedAt: new Date(),
        status: "in_review",
        logs: [...currentLogs, newLog],
      });

      void logAudit({
        req, action: 'dispute.assign', category: 'contract', severity: 'low',
        description: `Asignó la disputa ${dispute.id} a un administrador`,
        targetModel: 'Dispute', targetId: dispute.id, metadata: { assignedTo },
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
 * Update dispute priority (Admin only)
 * PUT /api/admin/disputes/:id/priority
 */
router.put(
  "/:id/priority",
  protect,
  authorize("owner", "super_admin", "moderator", "support"),
  [
    body("priority")
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Prioridad inválida"),
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
      const { priority } = req.body;

      const dispute = await Dispute.findByPk(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      const oldPriority = dispute.priority;
      const currentLogs = dispute.logs || [];
      const newLog = {
        action: `Prioridad actualizada`,
        performedBy: req.user.id,
        timestamp: new Date(),
        details: `De ${oldPriority} a ${priority}`,
      };

      await dispute.update({
        priority,
        logs: [...currentLogs, newLog],
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
 * Intervenir en un reclamo directo antes de que venza el plazo de las partes.
 * POST /api/admin/disputes/:id/intervenir  { justificacion }
 *
 * Pasa el reclamo a disputa (status open) con la justificacion en el log. Sin
 * esto, el equipo no puede resolver: el plazo de 72 h es de las partes.
 */
router.post(
  "/:id/intervenir",
  protect,
  authorize("owner", "super_admin", "moderator", "support"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const dispute = await Dispute.findByPk(req.params.id);
      if (!dispute) { res.status(404).json({ success: false, message: 'Disputa no encontrada' }); return; }
      const { escalarReclamo } = await import('../../services/reclamoDirecto.js');
      const r = await escalarReclamo(dispute, { adminId: req.user.id, justificacion: String(req.body.justificacion || '') });
      if (!r.ok) { res.status(400).json({ success: false, message: r.motivo }); return; }
      await logAudit({
        req,
        action: 'DISPUTE_ADMIN_INTERVENED_EARLY',
        category: 'disputes',
        severity: 'high',
        description: `Admin intervino en el reclamo ${dispute.id} antes del plazo: ${String(req.body.justificacion).slice(0, 300)}`,
        targetModel: 'Dispute',
        targetId: String(dispute.id),
      } as any);
      await dispute.reload();
      res.json({ success: true, data: dispute });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
    }
  },
);

/**
 * Quién puede confirmar que una devolución "se hizo por fuera" (pago que no pasó por MercadoPago). Es cerrar una
 * disputa como reembolsada SIN que ningún sistema mueva la plata: lo confirma una persona con autoridad sobre el
 * dinero. Soporte puede ejecutar un acuerdo (que sale por MercadoPago), pero no dar por hecha una devolución a mano.
 */
const ROLES_QUE_CONFIRMAN_DEVOLUCION_MANUAL = ['owner', 'super_admin', 'admin'];
function puedeConfirmarDevolucionManual(req: AuthRequest): boolean {
  return ROLES_QUE_CONFIRMAN_DEVOLUCION_MANUAL.includes(String((req.user as any)?.adminRole || ''));
}

/**
 * Ejecutar el acuerdo que las partes ya aceptaron.
 * POST /api/admin/disputes/:id/ejecutar-acuerdo
 *
 * Aceptar un acuerdo no mueve plata: la deja esperando esta acción. Es el
 * único camino por el que un acuerdo entre partes toca el dinero, y pasa por
 * resolverDisputa como cualquier otra resolución.
 */
router.post(
  "/:id/ejecutar-acuerdo",
  protect,
  authorize("owner", "super_admin", "admin", "moderator", "support"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const dispute = await Dispute.findByPk(req.params.id);
      if (!dispute) { res.status(404).json({ success: false, message: 'Disputa no encontrada' }); return; }
      const pideManual = req.body?.devolucionManual === true;
      if (pideManual && !puedeConfirmarDevolucionManual(req)) {
        res.status(403).json({ success: false, message: 'Sólo owner, super admin o admin pueden confirmar que una devolución se hizo por fuera.' });
        return;
      }
      const { ejecutarAcuerdo } = await import('../../services/reclamoDirecto.js');
      const r = await ejecutarAcuerdo(dispute, String(req.user.id), { devolucionManual: pideManual });
      if (!r.ok) { res.status(400).json({ success: false, message: r.motivo, code: r.codigo }); return; }
      await logAudit({
        req,
        action: 'DISPUTE_AGREEMENT_EXECUTED',
        category: 'disputes',
        severity: 'high',
        description: `Ejecutó el acuerdo aceptado por las partes en la disputa ${dispute.id}`,
        targetModel: 'Dispute',
        targetId: String(dispute.id),
      } as any);
      await dispute.reload();
      res.json({ success: true, message: 'Acuerdo ejecutado', data: dispute });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
    }
  },
);

/**
 * Resolve dispute (Admin only)
 * POST /api/admin/disputes/:id/resolve
 */
router.post(
  "/:id/resolve",
  protect,
  authorize("owner", "super_admin", "admin", "moderator"),
  [
    body("resolution").notEmpty().withMessage("La resolución es requerida"),
    body("resolutionType")
      .isIn(["full_release", "full_refund", "partial_refund", "no_action"])
      .withMessage("Tipo de resolución inválido"),
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
      const { resolution, resolutionType, refundAmount } = req.body;

      const dispute = await Dispute.findByPk(id, {
        include: [
          { model: Contract, as: "contract" },
          { model: Payment, as: "payment" },
        ],
      });

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Mientras esta en reclamo directo el plazo es de las partes (T&C 10.11).
      // Si hace falta meterse antes, primero "intervenir" con justificacion.
      if (dispute.isNegotiating()) {
        res.status(409).json({
          success: false,
          code: 'EN_RECLAMO_DIRECTO',
          message: `El reclamo está en manos de las partes hasta ${dispute.negotiationDeadline ? new Date(dispute.negotiationDeadline).toLocaleString('es-AR') : 'que venza el plazo'}. Para decidir antes, usá "Intervenir" e indicá por qué.`,
        });
        return;
      }

      // La plata se mueve por UNA sola puerta: resolverDisputa (servicio). Esta ruta tenía su propia copia del
      // movimiento de dinero, y era la vieja: marcaba el pago y la disputa como reembolsados ANTES de pedirle el
      // reembolso a MercadoPago y se tragaba el error (la disputa quedaba cerrada como "reembolsada" aunque no
      // hubiera salido un peso); calculaba mal el monto del reembolso total (amountArs y commission no existen en
      // el pago: daba 0 y MercadoPago devolvía TODO, comisión incluida); no miraba si la disputa ya estaba
      // resuelta; y saltaba el libro, la exclusión mutua y el tope de devoluciones.
      const monto = refundAmount === undefined || refundAmount === null || refundAmount === '' ? undefined : Number(refundAmount);
      if (monto !== undefined && (!Number.isFinite(monto) || monto < 0)) {
        res.status(400).json({ success: false, message: 'El monto a devolver no es válido.' });
        return;
      }
      if (resolutionType === 'partial_refund' && !(typeof monto === 'number' && monto > 0)) {
        res.status(400).json({ success: false, message: 'Para una devolución parcial indicá el monto a devolver (mayor que cero).' });
        return;
      }

      const pideManual = req.body.devolucionManual === true;
      if (pideManual && !puedeConfirmarDevolucionManual(req)) {
        res.status(403).json({ success: false, message: 'Sólo owner, super admin o admin pueden confirmar que una devolución se hizo por fuera.' });
        return;
      }

      const r = await resolverDisputa({
        disputeId: String(dispute.id),
        tipo: resolutionType,
        resolucion: String(resolution),
        montoDevolucion: monto,
        actor: `admin:${req.user.id}`,
        resueltoPor: String(req.user.id),
        devolucionManual: req.body.devolucionManual === true,
      });
      if (!r.ok) {
        res.status(409).json({
          success: false,
          code: r.codigo || 'DISPUTE_NOT_RESOLVED',
          message: r.motivo || 'No se pudo resolver la disputa.',
        });
        return;
      }
      await dispute.reload();

      void logAudit({
        req, action: 'dispute.resolve', category: 'payment', severity: 'high',
        description: `Resolvió la disputa ${dispute.id} (${resolutionType})${refundAmount ? ` · reembolso $${Number(refundAmount).toLocaleString('es-AR')}` : ''}`,
        targetModel: 'Dispute', targetId: dispute.id,
        metadata: { resolutionType, refundAmount: refundAmount || null, resolution, devolucionManual: req.body.devolucionManual === true },
      });

      // Avisos por mail y por socket: la plata ya se movió, así que un fallo acá NO puede responder 500.
      try {
        const contract = await Contract.findByPk(dispute.contractId);
        if (contract) {
          await emailService.sendDisputeResolvedEmail(contract.clientId, dispute.id.toString(), resolution, 0);
          await emailService.sendDisputeResolvedEmail(contract.doerId, dispute.id.toString(), resolution, 0);
          const { getIO } = await import('../../services/socket.js');
          getIO()?.to(`user:${contract.clientId}`).to(`user:${contract.doerId}`).emit('contract:updated', {
            contract: contract.toJSON(),
            action: 'dispute_resolved',
            resolutionType,
          });
        }
      } catch (avisoError) {
        console.error('[disputas] La disputa se resolvió pero falló el aviso:', avisoError);
      }

      res.json({
        success: true,
        message: "Disputa resuelta correctamente",
        data: dispute,
      });
    } catch (error: any) {
      console.error("Error resolving dispute:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Add message to dispute (Admin only)
 * POST /api/admin/disputes/:id/messages
 */
router.post(
  "/:id/messages",
  protect,
  authorize("owner", "super_admin", "moderator", "support"),
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
      const { message } = req.body;

      const dispute = await Dispute.findByPk(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Add message - use spread to ensure Sequelize detects JSONB change
      const currentMessages = dispute.messages || [];
      const newMessage = {
        from: req.user.id,
        message,
        isAdmin: true,
        createdAt: new Date(),
      };

      await dispute.update({
        messages: [...currentMessages, newMessage],
      });

      // Also add to logs
      const currentLogs = dispute.logs || [];
      const newLog = {
        action: "Mensaje de admin",
        performedBy: req.user.id,
        timestamp: new Date(),
        details: `Admin envió mensaje a la disputa`,
      };

      await dispute.update({
        logs: [...currentLogs, newLog],
      });

      // Reload with associations
      await dispute.reload({
        include: [
          { model: User, as: "initiator", attributes: ["name", "avatar"] },
          { model: User, as: "defendant", attributes: ["name", "avatar"] },
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
 * Add admin note to dispute
 * POST /api/admin/disputes/:id/note
 */
router.post(
  "/:id/note",
  protect,
  authorize("owner", "super_admin", "moderator", "support"),
  [body("note").notEmpty().withMessage("La nota es requerida")],
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
      const { note } = req.body;

      const dispute = await Dispute.findByPk(id);

      if (!dispute) {
        res.status(404).json({
          success: false,
          message: "Disputa no encontrada",
        });
        return;
      }

      // Add log entry
      const currentLogs = dispute.logs || [];
      const newLog = {
        action: `Nota agregada`,
        performedBy: req.user.id,
        timestamp: new Date(),
        details: note,
      };

      await dispute.update({
        logs: [...currentLogs, newLog],
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
 * Get dispute statistics (Admin only)
 * GET /api/admin/disputes/stats/overview
 */
router.get(
  "/stats/overview",
  protect,
  authorize("owner", "super_admin", "moderator"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const total = await Dispute.count();
      const open = await Dispute.count({ where: { status: "open" } });
      const inReview = await Dispute.count({ where: { status: "in_review" } });
      // En manos de las partes: no es trabajo del equipo todavia, pero se ve.
      const negotiation = await Dispute.count({ where: { status: "negotiation" } });
      const resolved = await Dispute.count({
        where: {
          status: { [Op.in]: ["resolved_released", "resolved_refunded", "resolved_partial"] },
        },
      });

      // Get priority stats
      const priorityStats = await Dispute.findAll({
        attributes: [
          "priority",
          [Dispute.sequelize!.fn("COUNT", Dispute.sequelize!.col("id")), "count"],
        ],
        group: ["priority"],
        raw: true,
      });

      // Get resolution type stats
      const resolutionStats = await Dispute.findAll({
        attributes: [
          "resolutionType",
          [Dispute.sequelize!.fn("COUNT", Dispute.sequelize!.col("id")), "count"],
        ],
        where: {
          status: { [Op.in]: ["resolved_released", "resolved_refunded", "resolved_partial"] },
        },
        group: ["resolutionType"],
        raw: true,
      });

      res.json({
        success: true,
        data: {
          total,
          open,
          inReview,
          negotiation,
          resolved,
          byPriority: priorityStats.reduce((acc: any, curr: any) => {
            acc[curr.priority] = parseInt(curr.count);
            return acc;
          }, {}),
          byResolutionType: resolutionStats.reduce((acc: any, curr: any) => {
            acc[curr.resolutionType] = parseInt(curr.count);
            return acc;
          }, {}),
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

/**
 * Create a dispute on behalf of a user (Admin only)
 * POST /api/admin/disputes/create
 */
router.post(
  "/create",
  protect,
  authorize("owner", "super_admin", "admin", "support"),
  [
    body("userId").notEmpty().withMessage("El ID del usuario es requerido"),
    body("contractId").notEmpty().withMessage("El ID del contrato es requerido"),
    body("title").notEmpty().withMessage("El título es requerido"),
    body("category")
      .isIn([
        "payment_issue",
        "quality_issue",
        "delivery_issue",
        "communication_issue",
        "scope_dispute",
        "contract_breach",
        "other",
      ])
      .withMessage("Categoría inválida"),
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

      const { userId, contractId, title, category, description, priority = "medium" } = req.body;

      // Verify user exists
      const user = await User.findByPk(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      // Verify contract exists and belongs to user
      const contract = await Contract.findByPk(contractId, {
        include: [
          { model: User, as: "clientUser" },
          { model: User, as: "doerUser" },
        ],
      });

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Verify user is part of the contract
      if (
        contract.client.toString() !== userId &&
        contract.doer.toString() !== userId
      ) {
        res.status(400).json({
          success: false,
          message: "El usuario no es parte de este contrato",
        });
        return;
      }

      // Determine who the dispute is against
      const againstUserId =
        contract.client.toString() === userId
          ? contract.doer.toString()
          : contract.client.toString();

      // Find payment for this contract (may not exist for free contracts)
      const payment = await Payment.findOne({ where: { contractId } });

      // Check if dispute already exists for this contract
      const existingDispute = await Dispute.findOne({
        where: {
          contractId,
          status: { [Op.notIn]: ["resolved_released", "resolved_refunded", "resolved_partial"] },
        },
      });

      if (existingDispute) {
        res.status(400).json({
          success: false,
          message: "Ya existe una disputa activa para este contrato",
        });
        return;
      }

      // Pause payment (move to disputed status) if exists
      if (payment) {
        await payment.update({ status: "disputed" });
      }

      // Create dispute
      const dispute = await Dispute.create({
        contractId,
        paymentId: payment?.id || null,
        initiatedBy: userId,
        against: againstUserId,
        title,
        category,
        description,
        priority,
        status: "open",
        logs: [
          {
            action: "Disputa creada por admin",
            performedBy: req.user.id,
            timestamp: new Date(),
            details: `Admin creó disputa en nombre de ${user.name}`,
          },
        ],
      });

      await dispute.reload({
        include: [
          { model: User, as: "initiator", attributes: ["name", "email", "avatar"] },
          { model: User, as: "defendant", attributes: ["name", "email", "avatar"] },
          { model: Contract, as: "contract" },
        ],
      });

      // Send notification emails
      const { Job } = await import("../../models/sql/Job.model.js");
      const job = await Job.findByPk(contract.jobId);

      await emailService.sendDisputeCreatedEmail(
        userId,
        againstUserId,
        dispute.id.toString(),
        job?.title || "Contrato",
        title
      );

      res.status(201).json({
        success: true,
        message: "Disputa creada exitosamente",
        data: dispute,
      });
    } catch (error: any) {
      console.error("Error creating dispute:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

export default router;
