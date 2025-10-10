import express, { Request, Response } from "express";
import User from "../../models/User.js";
import RefreshToken from "../../models/RefreshToken.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireRole } from "../../middleware/permissions.js";
import { verifyOwnerPassword } from "../../middleware/ownerVerification.js";
import { logAudit, getSeverityForAction, detectChanges } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(protect);

// @route   GET /api/admin/users
// @desc    Obtener lista de usuarios (con filtros)
// @access  Admin+
router.get(
  "/",
  requirePermission("users:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        page = "1",
        limit = "20",
        search,
        role,
        adminRole,
        isBanned,
        verificationLevel,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const query: any = {};

      // Filtros
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      if (role) query.role = role;
      if (adminRole) query.adminRole = adminRole;
      if (isBanned !== undefined) query.isBanned = isBanned === "true";
      if (verificationLevel) query.verificationLevel = verificationLevel;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const sortOptions: any = {};
      sortOptions[sortBy as string] = sortOrder === "desc" ? -1 : 1;

      const [users, total] = await Promise.all([
        User.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit as string))
          .select("-password -twoFactorSecret -twoFactorBackupCodes"),
        User.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: users,
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

// @route   GET /api/admin/users/:id
// @desc    Obtener detalles de un usuario
// @access  Admin+
router.get(
  "/:id",
  requirePermission("users:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.params.id).select(
        "-password -twoFactorSecret -twoFactorBackupCodes"
      );

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/admin/users/:id
// @desc    Actualizar usuario (Owner necesita password)
// @access  Owner only
router.put(
  "/:id",
  requireRole("owner"),
  verifyOwnerPassword,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, email, phone, bio, avatar, role, adminRole, permissions, verificationLevel } =
        req.body;

      const oldUser = await User.findById(req.params.id);

      if (!oldUser) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (bio) updateData.bio = bio;
      if (avatar) updateData.avatar = avatar;
      if (role) updateData.role = role;
      if (adminRole) updateData.adminRole = adminRole;
      if (permissions) updateData.permissions = permissions;
      if (verificationLevel) updateData.verificationLevel = verificationLevel;

      const user = await User.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      }).select("-password -twoFactorSecret -twoFactorBackupCodes");

      // Detectar cambios para audit log
      const changes = detectChanges(
        oldUser.toObject(),
        user!.toObject(),
        Object.keys(updateData)
      );

      await logAudit({
        req,
        action: "update_user",
        category: "user",
        severity: getSeverityForAction("update_user"),
        description: `Usuario ${user!.email} actualizado`,
        targetModel: "User",
        targetId: user!._id.toString(),
        targetIdentifier: user!.email,
        changes,
      });

      res.json({
        success: true,
        message: "Usuario actualizado correctamente",
        data: user,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/users/:id/ban
// @desc    Banear usuario
// @access  Admin+
router.post(
  "/:id/ban",
  requirePermission("users:ban"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { reason, expiresAt } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: "La razón del ban es requerida",
        });
        return;
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      // No se puede banear a un owner
      if (user.adminRole === "owner") {
        res.status(403).json({
          success: false,
          message: "No se puede banear al owner",
        });
        return;
      }

      user.isBanned = true;
      user.banReason = reason;
      user.bannedAt = new Date();
      user.bannedBy = req.user._id;
      user.infractions = (user.infractions || 0) + 1;

      if (expiresAt) {
        user.banExpiresAt = new Date(expiresAt);
      }

      await user.save();

      // Revocar todos los refresh tokens activos
      await RefreshToken.updateMany(
        { user: user._id, isRevoked: false },
        {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: "Usuario baneado",
        }
      );

      await logAudit({
        req,
        action: "ban_user",
        category: "user",
        severity: getSeverityForAction("ban_user"),
        description: `Usuario ${user.email} baneado. Razón: ${reason}`,
        targetModel: "User",
        targetId: user._id.toString(),
        targetIdentifier: user.email,
        metadata: { reason, expiresAt, infractions: user.infractions },
      });

      res.json({
        success: true,
        message: "Usuario baneado correctamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/admin/users/:id/unban
// @desc    Desbanear usuario
// @access  Admin+
router.post(
  "/:id/unban",
  requirePermission("users:unban"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      user.isBanned = false;
      user.banReason = undefined;
      user.bannedAt = undefined;
      user.bannedBy = undefined;
      user.banExpiresAt = undefined;

      await user.save();

      await logAudit({
        req,
        action: "unban_user",
        category: "user",
        severity: getSeverityForAction("unban_user"),
        description: `Usuario ${user.email} desbaneado`,
        targetModel: "User",
        targetId: user._id.toString(),
        targetIdentifier: user.email,
      });

      res.json({
        success: true,
        message: "Usuario desbaneado correctamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   DELETE /api/admin/users/:id
// @desc    Eliminar usuario (solo owner después de 2+ infracciones)
// @access  Owner only
router.delete(
  "/:id",
  requireRole("owner"),
  verifyOwnerPassword,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      if (user.adminRole === "owner") {
        res.status(403).json({
          success: false,
          message: "No se puede eliminar al owner",
        });
        return;
      }

      if (user.infractions < 2) {
        res.status(400).json({
          success: false,
          message: "El usuario debe tener al menos 2 infracciones para ser eliminado permanentemente",
          currentInfractions: user.infractions,
        });
        return;
      }

      await User.findByIdAndDelete(req.params.id);

      await logAudit({
        req,
        action: "delete_user",
        category: "user",
        severity: getSeverityForAction("delete_user"),
        description: `Usuario ${user.email} eliminado permanentemente`,
        targetModel: "User",
        targetId: user._id.toString(),
        targetIdentifier: user.email,
        metadata: { infractions: user.infractions },
      });

      res.json({
        success: true,
        message: "Usuario eliminado permanentemente",
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
