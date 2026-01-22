import express, { Request, Response } from "express";
import { Contract } from "../../models/sql/Contract.model.js";
import { User } from "../../models/sql/User.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { PaymentProof } from "../../models/sql/PaymentProof.model.js";
import { Notification } from "../../models/sql/Notification.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireRole } from "../../middleware/permissions.js";
import { verifyOwnerPassword } from "../../middleware/ownerVerification.js";
import { logAudit, getSeverityForAction, detectChanges } from "../../utils/auditLog.js";
import emailService from "../../services/email.js";
import type { AuthRequest } from "../../types/index.js";
import { Op } from "sequelize";
import { calculateCommission } from "../../services/commissionService.js";

const router = express.Router();

router.use(protect);

// @route   GET /api/admin/contracts
// @desc    Obtener lista de contratos
// @access  Admin+
router.get(
  "/",
  requirePermission("contracts:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        page = "1",
        limit = "20",
        status,
        paymentStatus,
        isDeleted,
        isHidden,
        userId,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const where: any = {};

      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (isDeleted !== undefined) where.isDeleted = isDeleted === "true";
      if (isHidden !== undefined) where.isHidden = isHidden === "true";
      if (userId) {
        where[Op.or] = [
          { clientId: userId },
          { doerId: userId },
        ];
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const order: any = [[sortBy as string, sortOrder === "desc" ? "DESC" : "ASC"]];

      const [contractsRaw, total] = await Promise.all([
        Contract.findAll({
          where,
          include: [
            { model: User, as: "client", attributes: ["id", "name", "email"] },
            { model: User, as: "doer", attributes: ["id", "name", "email"] },
            { model: Job, as: "job", attributes: ["id", "title"] },
          ],
          order,
          offset,
          limit: parseInt(limit as string),
        }),
        Contract.count({ where }),
      ]);

      // Fetch payments for each contract separately to avoid association issues
      const contractIds = contractsRaw.map(c => c.id);
      const payments = contractIds.length > 0 ? await Payment.findAll({
        where: { contractId: { [Op.in]: contractIds } },
        include: [
          {
            model: PaymentProof,
            as: "proofs",
            required: false,
            attributes: ["id", "fileUrl", "status", "uploadedAt", "isActive"]
          }
        ],
        attributes: ["id", "status", "amount", "platformFee", "contractId"]
      }) : [];

      // Map payments by contractId
      const paymentsByContractId = new Map<string, any>();
      for (const payment of payments) {
        paymentsByContractId.set(payment.contractId!, payment);
      }

      // Attach payments to contracts
      const contracts = contractsRaw.map(contract => {
        const contractJson = contract.toJSON();
        contractJson.payment = paymentsByContractId.get(contract.id) || null;
        return contractJson;
      });

      res.json({
        success: true,
        data: contracts,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
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

// @route   POST /api/admin/contracts/create
// @desc    Crear contrato (Admin)
// @access  Admin+
router.post(
  "/create",
  requirePermission("contract:create"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        clientId,
        doerId,
        jobId,
        title,
        description,
        price,
        startDate,
        endDate,
        milestones,
      } = req.body;

      // Validate required fields
      if (!clientId || !doerId || !title || !price || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Faltan campos requeridos",
        });
        return;
      }

      // Validate that client and doer exist
      const [client, doer] = await Promise.all([
        User.findByPk(clientId),
        User.findByPk(doerId),
      ]);

      if (!client) {
        res.status(404).json({
          success: false,
          message: "Cliente no encontrado",
        });
        return;
      }

      if (!doer) {
        res.status(404).json({
          success: false,
          message: "Doer no encontrado",
        });
        return;
      }

      // Validate job if provided
      let job = null;
      if (jobId) {
        const { Job } = await import("../../models/sql/index.js");
        job = await Job.findByPk(jobId);
        if (!job) {
          res.status(404).json({
            success: false,
            message: "Trabajo no encontrado",
          });
          return;
        }
      }

      // Calculate commission using volume-based service
      const commissionResult = await calculateCommission(clientId, price);
      const commission = commissionResult.commission;
      const totalPrice = price + commission;

      // Create contract
      const contract = await Contract.create({
        client: clientId,
        doer: doerId,
        job: jobId || undefined,
        title,
        description,
        price,
        commission,
        totalPrice,
        status: "accepted", // Admin-created contracts start as accepted
        paymentStatus: "pending",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        milestones: milestones || [],
        createdBy: req.user.id,
      });

      await contract.reload({
        include: [
          { model: User, as: "clientUser", attributes: ["name", "email", "avatar"] },
          { model: User, as: "doerUser", attributes: ["name", "email", "avatar"] },
        ],
      });

      // Create audit log
      await logAudit({
        req,
        action: "contract_created_by_admin",
        category: "contract",
        severity: "medium",
        description: `Admin ${req.user.name} created contract: ${title}`,
        metadata: {
          contractId: contract.id,
          clientId,
          doerId,
          price,
        },
      });

      res.status(201).json({
        success: true,
        data: contract,
        message: "Contrato creado exitosamente",
      });
    } catch (error: any) {
      console.error("Error creating contract:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   GET /api/admin/contracts/:id
// @desc    Obtener detalles de contrato
// @access  Admin+
router.get(
  "/:id",
  requirePermission("contracts:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contract = await Contract.findByPk(req.params.id, {
        include: [
          { model: User, as: "clientUser", attributes: ["name", "email", "phone", "avatar"] },
          { model: User, as: "doerUser", attributes: ["name", "email", "phone", "avatar"] },
          { model: User, as: "deletedByUser", attributes: ["name", "email"] },
        ],
      });

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        data: contract,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/admin/contracts/:id
// @desc    Actualizar contrato (Owner con password)
// @access  Owner only
router.put(
  "/:id",
  requireRole("owner"),
  verifyOwnerPassword,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, price, notes } = req.body;

      const oldContract = await Contract.findByPk(req.params.id);

      if (!oldContract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (price !== undefined) updateData.price = price;
      if (notes) updateData.notes = notes;

      await oldContract.update(updateData);

      const changes = detectChanges(
        oldContract.get({ plain: true }),
        (await Contract.findByPk(req.params.id))!.get({ plain: true }),
        Object.keys(updateData)
      );

      await logAudit({
        req,
        action: "update_contract",
        category: "contract",
        severity: getSeverityForAction("update_contract"),
        description: `Contrato ${oldContract.id} actualizado`,
        targetModel: "Contract",
        targetId: oldContract.id.toString(),
        changes,
      });

      res.json({
        success: true,
        message: "Contrato actualizado correctamente",
        data: oldContract,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/contracts/:id/approve
// @desc    Aprobar contrato - cambia estado a "ready" (listo para aceptación de las partes)
// @access  Admin+
router.post(
  "/:id/approve",
  requirePermission("contracts:update"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { adminNotes } = req.body;

      const contract = await Contract.findByPk(req.params.id, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
          { model: Job, as: 'job', attributes: ['id', 'title'] }
        ]
      });

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Solo se puede aprobar contratos en estado pending o in_review
      if (!['pending', 'in_review'].includes(contract.status)) {
        res.status(400).json({
          success: false,
          message: `No se puede aprobar un contrato con estado "${contract.status}". Solo contratos pendientes o en revisión.`,
        });
        return;
      }

      const previousStatus = contract.status;

      // Cambiar estado a "ready" - listo para que las partes acepten
      await contract.update({
        status: 'ready',
        notes: adminNotes ? `${contract.notes || ''}\n[Admin] ${adminNotes}`.trim() : contract.notes,
      });

      const client = contract.client as any;
      const doer = contract.doer as any;
      const job = contract.job as any;
      const jobTitle = job?.title || 'Contrato';

      // Notificar al cliente
      await Notification.create({
        recipientId: contract.clientId,
        type: 'success',
        category: 'contract',
        title: 'Contrato aprobado',
        message: `El contrato para "${jobTitle}" ha sido aprobado y está listo para tu aceptación.`,
        relatedModel: 'Contract',
        relatedId: contract.id,
        actionText: 'Ver contrato',
        data: { contractId: contract.id, jobId: job?.id },
        read: false,
      });

      // Notificar al trabajador
      await Notification.create({
        recipientId: contract.doerId,
        type: 'success',
        category: 'contract',
        title: 'Contrato aprobado',
        message: `El contrato para "${jobTitle}" ha sido aprobado y está listo para tu aceptación.`,
        relatedModel: 'Contract',
        relatedId: contract.id,
        actionText: 'Ver contrato',
        data: { contractId: contract.id, jobId: job?.id },
        read: false,
      });

      // Enviar emails
      if (client?.email) {
        await emailService.sendEmail({
          to: client.email,
          subject: `Contrato aprobado - ${jobTitle}`,
          html: `
            <h2>¡Tu contrato ha sido aprobado!</h2>
            <p>El contrato para <strong>"${jobTitle}"</strong> ha sido revisado y aprobado por nuestro equipo.</p>
            <p>Ahora está listo para que ambas partes lo acepten y puedan comenzar a trabajar.</p>
            <p>
              <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                 style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Ver contrato
              </a>
            </p>
          `,
        });
      }

      if (doer?.email) {
        await emailService.sendEmail({
          to: doer.email,
          subject: `Contrato aprobado - ${jobTitle}`,
          html: `
            <h2>¡El contrato ha sido aprobado!</h2>
            <p>El contrato para <strong>"${jobTitle}"</strong> ha sido revisado y aprobado.</p>
            <p>Ahora está listo para que ambas partes lo acepten y puedan comenzar a trabajar.</p>
            <p>
              <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                 style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Ver contrato
              </a>
            </p>
          `,
        });
      }

      await logAudit({
        req,
        action: "approve_contract",
        category: "contract",
        severity: "medium",
        description: `Admin ${req.user.name} aprobó contrato ${contract.id}. Estado: ${previousStatus} → ready`,
        targetModel: "Contract",
        targetId: contract.id.toString(),
        metadata: { previousStatus, newStatus: 'ready', adminNotes },
      });

      res.json({
        success: true,
        message: "Contrato aprobado correctamente. Las partes han sido notificadas.",
        data: contract,
      });
    } catch (error: any) {
      console.error("Error approving contract:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/contracts/:id/reject
// @desc    Rechazar contrato en revisión
// @access  Admin+
router.post(
  "/:id/reject",
  requirePermission("contracts:update"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: "Debe proporcionar una razón para el rechazo",
        });
        return;
      }

      const contract = await Contract.findByPk(req.params.id, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
          { model: Job, as: 'job', attributes: ['id', 'title'] }
        ]
      });

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      if (!['pending', 'in_review'].includes(contract.status)) {
        res.status(400).json({
          success: false,
          message: `No se puede rechazar un contrato con estado "${contract.status}".`,
        });
        return;
      }

      const previousStatus = contract.status;

      await contract.update({
        status: 'rejected',
        cancellationReason: reason,
        cancelledBy: req.user.id,
      });

      const client = contract.client as any;
      const doer = contract.doer as any;
      const job = contract.job as any;
      const jobTitle = job?.title || 'Contrato';

      // Notificar a ambas partes
      for (const user of [client, doer]) {
        if (user) {
          await Notification.create({
            recipientId: user.id,
            type: 'error',
            category: 'contract',
            title: 'Contrato rechazado',
            message: `El contrato para "${jobTitle}" ha sido rechazado. Razón: ${reason}`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            actionText: 'Ver detalles',
            data: { contractId: contract.id, reason },
            read: false,
          });

          if (user.email) {
            await emailService.sendEmail({
              to: user.email,
              subject: `Contrato rechazado - ${jobTitle}`,
              html: `
                <h2>El contrato ha sido rechazado</h2>
                <p>El contrato para <strong>"${jobTitle}"</strong> ha sido rechazado por nuestro equipo.</p>
                <p><strong>Razón:</strong> ${reason}</p>
                <p>Por favor, revisa los detalles y considera crear un nuevo contrato que cumpla con nuestras políticas.</p>
              `,
            });
          }
        }
      }

      await logAudit({
        req,
        action: "reject_contract",
        category: "contract",
        severity: "medium",
        description: `Admin ${req.user.name} rechazó contrato ${contract.id}. Razón: ${reason}`,
        targetModel: "Contract",
        targetId: contract.id.toString(),
        metadata: { previousStatus, reason },
      });

      res.json({
        success: true,
        message: "Contrato rechazado. Las partes han sido notificadas.",
        data: contract,
      });
    } catch (error: any) {
      console.error("Error rejecting contract:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/contracts/:id/hide
// @desc    Ocultar contrato (soft delete)
// @access  Admin+
router.post(
  "/:id/hide",
  requirePermission("contracts:ban"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: "La razón es requerida",
        });
        return;
      }

      const contract = await Contract.findByPk(req.params.id);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      const newInfractions = (contract.infractions || 0) + 1;

      await contract.update({
        isHidden: true,
        deletionReason: reason,
        deletedBy: req.user.id,
        infractions: newInfractions,
      });

      await logAudit({
        req,
        action: "ban_contract",
        category: "contract",
        severity: getSeverityForAction("ban_contract"),
        description: `Contrato ${contract.id} ocultado. Razón: ${reason}`,
        targetModel: "Contract",
        targetId: contract.id.toString(),
        metadata: { reason, infractions: newInfractions },
      });

      res.json({
        success: true,
        message: "Contrato ocultado correctamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/contracts/:id/unhide
// @desc    Mostrar contrato oculto
// @access  Admin+
router.post(
  "/:id/unhide",
  requirePermission("contracts:unban"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contract = await Contract.findByPk(req.params.id);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      await contract.update({
        isHidden: false,
        deletionReason: null,
      });

      await logAudit({
        req,
        action: "unban_contract",
        category: "contract",
        severity: getSeverityForAction("unban_contract"),
        description: `Contrato ${contract.id} visible nuevamente`,
        targetModel: "Contract",
        targetId: contract.id.toString(),
      });

      res.json({
        success: true,
        message: "Contrato visible nuevamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/contracts/:id/change-status
// @desc    Cambiar manualmente el estado de un contrato (con auditoría)
// @access  Admin+
router.post(
  "/:id/change-status",
  requirePermission("contracts:update"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, reason, linkedDisputeId } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          message: "El nuevo estado es requerido",
        });
        return;
      }

      if (!reason || reason.trim().length < 10) {
        res.status(400).json({
          success: false,
          message: "La razón del cambio es requerida (mínimo 10 caracteres)",
        });
        return;
      }

      const validStatuses = [
        'pending', 'ready', 'accepted', 'in_progress',
        'awaiting_confirmation', 'completed', 'cancelled',
        'rejected', 'disputed'
      ];

      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: `Estado inválido. Estados válidos: ${validStatuses.join(', ')}`,
        });
        return;
      }

      const contract = await Contract.findByPk(req.params.id, {
        include: [
          { model: User, as: "client", attributes: ["id", "name", "email"] },
          { model: User, as: "doer", attributes: ["id", "name", "email"] },
          { model: Job, as: "job", attributes: ["id", "title"] },
        ],
      });

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      const previousStatus = contract.status;

      // Update status with admin metadata
      const statusChangeLog = {
        from: previousStatus,
        to: status,
        changedBy: req.user.id,
        changedByName: req.user.name,
        reason,
        linkedDisputeId: linkedDisputeId || null,
        timestamp: new Date(),
      };

      const statusHistory = contract.statusHistory || [];
      statusHistory.push(statusChangeLog);

      await contract.update({
        status,
        statusHistory,
      });

      const client = contract.client as any;
      const doer = contract.doer as any;
      const job = contract.job as any;
      const jobTitle = job?.title || "Contrato";

      // Notificar a ambas partes
      for (const user of [client, doer]) {
        if (user) {
          await Notification.create({
            recipientId: user.id,
            type: "info",
            category: "contract",
            title: "Estado del contrato actualizado",
            message: `El estado del contrato "${jobTitle}" fue cambiado de ${previousStatus.toUpperCase()} a ${status.toUpperCase()} por un administrador. Razón: ${reason}${linkedDisputeId ? ` (Disputa vinculada: ${linkedDisputeId})` : ''}`,
            relatedModel: "Contract",
            relatedId: contract.id,
            actionText: "Ver contrato",
            data: { contractId: contract.id, previousStatus, newStatus: status, linkedDisputeId },
            read: false,
          });

          if (user.email) {
            await emailService.sendEmail({
              to: user.email,
              subject: `Estado de contrato actualizado - ${jobTitle}`,
              html: `
                <h2>Estado del contrato actualizado</h2>
                <p>El estado del contrato para <strong>"${jobTitle}"</strong> ha sido actualizado por un administrador.</p>
                <p><strong>Estado anterior:</strong> ${previousStatus.toUpperCase()}</p>
                <p><strong>Nuevo estado:</strong> ${status.toUpperCase()}</p>
                <p><strong>Razón:</strong> ${reason}</p>
                ${linkedDisputeId ? `<p><strong>Disputa vinculada:</strong> <code>${linkedDisputeId}</code></p>` : ''}
                <p>
                  <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                     style="display: inline-block; padding: 12px 24px; background-color: #0284c7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Ver contrato
                  </a>
                </p>
              `,
            });
          }
        }
      }

      await logAudit({
        req,
        action: "change_contract_status",
        category: "contract",
        severity: "high",
        description: `Admin ${req.user.name} cambió el estado del contrato ${contract.id} de ${previousStatus} a ${status}. Razón: ${reason}${linkedDisputeId ? `. Disputa vinculada: ${linkedDisputeId}` : ''}`,
        targetModel: "Contract",
        targetId: contract.id.toString(),
        metadata: { previousStatus, newStatus: status, reason, linkedDisputeId },
      });

      res.json({
        success: true,
        message: "Estado del contrato actualizado correctamente. Las partes han sido notificadas.",
        data: {
          contract,
          statusChange: statusChangeLog,
        },
      });
    } catch (error: any) {
      console.error("Error changing contract status:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   DELETE /api/admin/contracts/:id
// @desc    Eliminar contrato permanentemente (Owner, 2+ infracciones)
// @access  Owner only
router.delete(
  "/:id",
  requireRole("owner"),
  verifyOwnerPassword,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contract = await Contract.findByPk(req.params.id);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      if (contract.infractions < 2) {
        res.status(400).json({
          success: false,
          message:
            "El contrato debe tener al menos 2 infracciones para ser eliminado permanentemente",
          currentInfractions: contract.infractions,
        });
        return;
      }

      await contract.update({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      });

      await logAudit({
        req,
        action: "delete_contract",
        category: "contract",
        severity: getSeverityForAction("delete_contract"),
        description: `Contrato ${contract.id} eliminado permanentemente`,
        targetModel: "Contract",
        targetId: contract.id.toString(),
        metadata: { infractions: contract.infractions },
      });

      res.json({
        success: true,
        message: "Contrato eliminado permanentemente",
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
