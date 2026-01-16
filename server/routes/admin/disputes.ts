import { Router, Response } from "express";
import { protect, authorize, AuthRequest } from "../../middleware/auth.js";
import { Dispute } from "../../models/sql/Dispute.model.js";
import { User } from "../../models/sql/User.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { body, validationResult } from "express-validator";
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
      const { status, priority, page = 1, limit = 20 } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;

      const disputes = await Dispute.findAll({
        where,
        include: [
          { model: Contract, as: "contract", attributes: ["price"] },
          { model: User, as: "initiator", attributes: ["name", "email", "avatar"] },
          { model: User, as: "defendant", attributes: ["name", "email", "avatar"] },
          { model: User, as: "assignedAdmin", attributes: ["name"] },
          { model: User, as: "resolver", attributes: ["name"] },
        ],
        order: [["createdAt", "DESC"]],
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
      });

      const total = await Dispute.count({ where });

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
          { model: User, as: "assignedAdmin", attributes: ["name", "email"] },
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
 * Resolve dispute (Admin only)
 * POST /api/admin/disputes/:id/resolve
 */
router.post(
  "/:id/resolve",
  protect,
  authorize("owner", "super_admin", "moderator"),
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

      const contract = await Contract.findByPk(dispute.contractId);
      const payment = await Payment.findByPk(dispute.paymentId);

      if (!contract || !payment) {
        res.status(404).json({
          success: false,
          message: "Contrato o pago no encontrado",
        });
        return;
      }

      // Update dispute
      const disputeUpdateData: any = {
        resolution,
        resolutionType,
        resolvedAt: new Date(),
        resolvedBy: req.user.id,
        refundAmount,
        platformFeeRefunded: false, // Nunca se devuelve la comisión
      };

      // Process resolution
      switch (resolutionType) {
        case "full_release":
          // Release payment to doer
          await contract.update({
            status: "completed",
            paymentStatus: "released",
            escrowStatus: "released",
          });
          await payment.update({
            status: "completed",
            escrowReleasedAt: new Date(),
          });

          // Release escrow - MercadoPago handles this automatically
          // No need to call API, just update payment status
          if (payment.mercadopagoPaymentId) {
            console.log(`✅ Escrow released for payment: ${payment.mercadopagoPaymentId}`);
          }

          disputeUpdateData.status = "resolved_released";
          break;

        case "full_refund":
          // Refund to client (minus platform fee)
          await contract.update({
            status: "cancelled",
            paymentStatus: "refunded",
            escrowStatus: "refunded",
          });
          await payment.update({
            status: "refunded",
            refundedAt: new Date(),
          });

          // Refund via MercadoPago (minus platform fee)
          if (payment.mercadopagoPaymentId) {
            try {
              const refundAmountARS = payment.amountArs || 0;
              const commission = (payment as any).commission || 0;
              const refundableAmount = refundAmountARS - commission; // Don't refund commission

              await mercadopagoService.refundPayment(
                payment.mercadopagoPaymentId,
                'mercadopago',
                refundableAmount
              );
            } catch (error) {
              console.error("Error processing refund:", error);
            }
          }

          disputeUpdateData.status = "resolved_refunded";
          break;

        case "partial_refund":
          // Partial refund to client
          await contract.update({
            status: "completed",
            paymentStatus: "partially_refunded",
            escrowStatus: "released", // Escrow se libera (parcialmente al doer, parcialmente reembolsado)
          });
          await payment.update({
            status: "partially_refunded",
            refundedAt: new Date(),
          });

          // Partial refund via MercadoPago
          if (payment.mercadopagoPaymentId && refundAmount) {
            try {
              await mercadopagoService.refundPayment(payment.mercadopagoPaymentId, 'mercadopago', refundAmount);
            } catch (error) {
              console.error("Error processing partial refund:", error);
            }
          }

          disputeUpdateData.status = "resolved_partial";
          break;

        case "no_action":
          // No changes to payment
          disputeUpdateData.status = "resolved_released";
          break;
      }

      // Add log entry
      const currentLogs = dispute.logs || [];
      const newLog = {
        action: `Disputa resuelta`,
        performedBy: req.user.id,
        timestamp: new Date(),
        details: `Tipo: ${resolutionType}`,
      };

      disputeUpdateData.logs = [...currentLogs, newLog];
      await dispute.update(disputeUpdateData);

      // Send email notifications
      const { Job } = await import("../../models/sql/Job.model.js");
      const job = await Job.findByPk(contract.jobId);

      await emailService.sendDisputeResolvedEmail(
        dispute.id.toString(),
        contract.client.toString(),
        contract.doer.toString(),
        job?.title || "Contrato",
        resolution,
        resolutionType
      );

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

      // Find payment for this contract
      const payment = await Payment.findOne({ where: { contractId } });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Pago no encontrado para este contrato",
        });
        return;
      }

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

      // Pause payment (move to disputed status)
      await payment.update({ status: "disputed" });

      // Create dispute
      const dispute = await Dispute.create({
        contractId,
        paymentId: payment.id,
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
        dispute.id.toString(),
        userId,
        againstUserId,
        contractId,
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
