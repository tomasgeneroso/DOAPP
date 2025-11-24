import express, { Request, Response } from "express";
import { User } from "../../models/sql/User.model.js";
import { RefreshToken } from "../../models/sql/RefreshToken.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireRole } from "../../middleware/permissions.js";
import { verifyOwnerPassword } from "../../middleware/ownerVerification.js";
import { logAudit, getSeverityForAction, detectChanges } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";
import { Op } from 'sequelize';

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

      const where: any = {};

      // Filtros
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (role) where.role = role;
      if (adminRole) where.adminRole = adminRole;
      if (isBanned !== undefined) where.isBanned = isBanned === "true";
      if (verificationLevel) where.verificationLevel = verificationLevel;

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const order: any = [[sortBy as string, sortOrder === "desc" ? "DESC" : "ASC"]];

      const { count: total, rows: users } = await User.findAndCountAll({
        where,
        order,
        offset,
        limit: parseInt(limit as string),
        attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] },
      });

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
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] },
      });

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

      const user = await User.findByPk(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      const oldData = user.toJSON();

      // Update fields
      if (name) user.name = name;
      if (email) user.email = email;
      if (phone) user.phone = phone;
      if (bio) user.bio = bio;
      if (avatar) user.avatar = avatar;
      if (role) user.role = role;
      if (adminRole) user.adminRole = adminRole;
      if (permissions) user.permissions = permissions;
      if (verificationLevel) user.verificationLevel = verificationLevel;

      await user.save();

      // Detectar cambios para audit log
      const changedFields = Object.keys(req.body).filter(k => k !== 'ownerPassword');
      const changes = detectChanges(oldData, user.toJSON(), changedFields);

      await logAudit({
        req,
        action: "update_user",
        category: "user",
        severity: getSeverityForAction("update_user"),
        description: `Usuario ${user.email} actualizado`,
        targetModel: "User",
        targetId: user.id,
        targetIdentifier: user.email,
        changes,
      });

      // Return user without sensitive fields
      const userData = user.toJSON();
      delete userData.password;
      delete userData.twoFactorSecret;
      delete userData.twoFactorBackupCodes;

      res.json({
        success: true,
        message: "Usuario actualizado correctamente",
        data: userData,
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

      const user = await User.findByPk(req.params.id);

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
      user.bannedBy = req.user.id;
      user.infractions = (user.infractions || 0) + 1;

      if (expiresAt) {
        user.banExpiresAt = new Date(expiresAt);
      }

      await user.save();

      // Revocar todos los refresh tokens activos
      await RefreshToken.update(
        {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: "Usuario baneado",
        },
        { where: { userId: user.id, isRevoked: false } }
      );

      await logAudit({
        req,
        action: "ban_user",
        category: "user",
        severity: getSeverityForAction("ban_user"),
        description: `Usuario ${user.email} baneado. Razón: ${reason}`,
        targetModel: "User",
        targetId: user.id,
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
      const user = await User.findByPk(req.params.id);

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
        targetId: user.id,
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
      const user = await User.findByPk(req.params.id);

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

      const userEmail = user.email;
      const userId = user.id;
      const infractions = user.infractions;

      await user.destroy();

      await logAudit({
        req,
        action: "delete_user",
        category: "user",
        severity: getSeverityForAction("delete_user"),
        description: `Usuario ${userEmail} eliminado permanentemente`,
        targetModel: "User",
        targetId: userId,
        targetIdentifier: userEmail,
        metadata: { infractions },
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
