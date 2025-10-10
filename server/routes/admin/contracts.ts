import express, { Request, Response } from "express";
import Contract from "../../models/Contract.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireRole } from "../../middleware/permissions.js";
import { verifyOwnerPassword } from "../../middleware/ownerVerification.js";
import { logAudit, getSeverityForAction, detectChanges } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";

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
        isDeleted,
        isHidden,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const query: any = {};

      if (status) query.status = status;
      if (isDeleted !== undefined) query.isDeleted = isDeleted === "true";
      if (isHidden !== undefined) query.isHidden = isHidden === "true";

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const sortOptions: any = {};
      sortOptions[sortBy as string] = sortOrder === "desc" ? -1 : 1;

      const [contracts, total] = await Promise.all([
        Contract.find(query)
          .populate("client", "name email")
          .populate("doer", "name email")
          .populate("job", "title")
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit as string)),
        Contract.countDocuments(query),
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

// @route   GET /api/admin/contracts/:id
// @desc    Obtener detalles de contrato
// @access  Admin+
router.get(
  "/:id",
  requirePermission("contracts:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contract = await Contract.findById(req.params.id)
        .populate("client", "name email phone avatar")
        .populate("doer", "name email phone avatar")
        .populate("job")
        .populate("deletedBy", "name email");

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

      const oldContract = await Contract.findById(req.params.id);

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

      const contract = await Contract.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      });

      const changes = detectChanges(
        oldContract.toObject(),
        contract!.toObject(),
        Object.keys(updateData)
      );

      await logAudit({
        req,
        action: "update_contract",
        category: "contract",
        severity: getSeverityForAction("update_contract"),
        description: `Contrato ${contract!._id} actualizado`,
        targetModel: "Contract",
        targetId: contract!._id.toString(),
        changes,
      });

      res.json({
        success: true,
        message: "Contrato actualizado correctamente",
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

      const contract = await Contract.findById(req.params.id);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      contract.isHidden = true;
      contract.deletionReason = reason;
      contract.deletedBy = req.user._id;
      contract.infractions = (contract.infractions || 0) + 1;

      await contract.save();

      await logAudit({
        req,
        action: "ban_contract",
        category: "contract",
        severity: getSeverityForAction("ban_contract"),
        description: `Contrato ${contract._id} ocultado. Razón: ${reason}`,
        targetModel: "Contract",
        targetId: contract._id.toString(),
        metadata: { reason, infractions: contract.infractions },
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
      const contract = await Contract.findById(req.params.id);

      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      contract.isHidden = false;
      contract.deletionReason = undefined;

      await contract.save();

      await logAudit({
        req,
        action: "unban_contract",
        category: "contract",
        severity: getSeverityForAction("unban_contract"),
        description: `Contrato ${contract._id} visible nuevamente`,
        targetModel: "Contract",
        targetId: contract._id.toString(),
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
      const contract = await Contract.findById(req.params.id);

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

      contract.isDeleted = true;
      contract.deletedAt = new Date();
      contract.deletedBy = req.user._id;

      await contract.save();

      await logAudit({
        req,
        action: "delete_contract",
        category: "contract",
        severity: getSeverityForAction("delete_contract"),
        description: `Contrato ${contract._id} eliminado permanentemente`,
        targetModel: "Contract",
        targetId: contract._id.toString(),
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
