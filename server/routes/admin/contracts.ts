import express, { Request, Response } from "express";
import { Contract } from "../../models/sql/Contract.model.js";
import { User } from "../../models/sql/User.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireRole } from "../../middleware/permissions.js";
import { verifyOwnerPassword } from "../../middleware/ownerVerification.js";
import { logAudit, getSeverityForAction, detectChanges } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";
import { Op } from "sequelize";

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
          { client: userId },
          { doer: userId },
        ];
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const order: any = [[sortBy as string, sortOrder === "desc" ? "DESC" : "ASC"]];

      const [contracts, total] = await Promise.all([
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
        const Job = (await import("../../models/Job.js")).default;
        job = await Job.findByPk(jobId);
        if (!job) {
          res.status(404).json({
            success: false,
            message: "Trabajo no encontrado",
          });
          return;
        }
      }

      // Calculate commission (5% standard)
      const commissionRate = 0.05;
      const commission = price * commissionRate;
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
