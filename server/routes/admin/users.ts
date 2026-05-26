import express, { Request, Response } from "express";
import { User } from "../../models/sql/User.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { RefreshToken } from "../../models/sql/RefreshToken.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireRole } from "../../middleware/permissions.js";
import { verifyOwnerPassword } from "../../middleware/ownerVerification.js";
import { logAudit, getSeverityForAction, detectChanges } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";
import { Op, literal } from 'sequelize';
import { isValidUUID } from "../../utils/sanitizer.js";

const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

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
        dniVerified,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const where: any = {};

      // Filtros
      if (search) {
        const searchStr = search as string;
        const isFullUUID = isValidUUID(searchStr);

        // Always collect user IDs that match this search
        const userIds = new Set<string>();

        // If it looks like a UUID fragment (hex chars + dashes, >= 4 chars), resolve related IDs
        if (/^[0-9a-f-]{4,}$/i.test(searchStr)) {
          // Partial/full UUID: find contracts matching this ID fragment
          const contracts = await Contract.findAll({
            where: {
              [Op.or]: [
                literal(`CAST("contracts"."id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`),
                literal(`CAST("contracts"."job_id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`),
              ],
            },
            attributes: ['clientId', 'doerId'],
            limit: 20,
          }).catch(() => []);
          contracts.forEach(c => {
            if (c.clientId) userIds.add(c.clientId);
            if (c.doerId) userIds.add(c.doerId);
          });

          // Find jobs matching this ID fragment
          const jobs = await Job.findAll({
            where: { [Op.or]: [literal(`CAST("jobs"."id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`)] },
            attributes: ['clientId'],
            limit: 10,
          }).catch(() => []);
          jobs.forEach(j => { if (j.clientId) userIds.add(j.clientId); });

          // Direct user ID match
          if (isFullUUID) userIds.add(searchStr);

          if (userIds.size > 0) {
            where[Op.or] = [
              { id: { [Op.in]: Array.from(userIds) } },
              { name: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
              { email: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
              literal(`CAST("users"."id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`),
            ];
          } else {
            where[Op.or] = [
              { name: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
              { email: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
              literal(`CAST("users"."id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`),
            ];
          }
        } else {
          where[Op.or] = [
            { name: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
            { email: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
            { username: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
          ];
        }
      }

      if (role) where.role = role;
      if (adminRole) where.adminRole = adminRole;
      if (isBanned !== undefined) where.isBanned = isBanned === "true";
      if (verificationLevel) where.verificationLevel = verificationLevel;
      if (dniVerified !== undefined) where.dniVerified = dniVerified === "true";

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const order: any = [[sortBy as string, sortOrder === "desc" ? "DESC" : "ASC"]];

      const { count: total, rows: users } = await User.findAndCountAll({
        where,
        order,
        offset,
        limit: parseInt(limit as string),
        attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] },
        include: [
          {
            model: User,
            as: 'banningAdmin',
            attributes: ['id', 'name', 'email'],
            required: false,
          },
        ],
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

      // Get login devices
      const { LoginDevice } = await import('../../models/sql/LoginDevice.model.js');
      const devices = await LoginDevice.findAll({
        where: { userId: user.id },
        order: [['lastLoginAt', 'DESC']],
        limit: 10,
      });

      res.json({
        success: true,
        data: {
          ...user.toJSON(),
          devices: devices.map((d: any) => ({
            id: d.id,
            deviceType: d.deviceType,
            browser: d.browser,
            os: d.os,
            country: d.country,
            city: d.city,
            ipAddress: d.ipAddress,
            lastLoginAt: d.lastLoginAt,
            loginCount: d.loginCount,
            isTrusted: d.isTrusted,
          })),
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

// @route   POST /api/admin/users/:id/membership
// @desc    Asignar o revocar membresía (solo owner)
// @access  Owner only
router.post(
  "/:id/membership",
  requireRole("owner"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { tier, durationDays } = req.body;

      const validTiers = ['free', 'pro', 'super_pro'];
      if (!tier || !validTiers.includes(tier)) {
        res.status(400).json({ success: false, message: "Tier inválido. Debe ser 'free', 'pro' o 'super_pro'" });
        return;
      }

      const user = await User.findByPk(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      if (tier === 'free') {
        await user.deactivateMembership();
      } else {
        const days = durationDays ? Number(durationDays) : 30;
        const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await user.activateMembership(tier as 'pro' | 'super_pro', undefined, endDate);
      }

      await logAudit({
        req,
        action: "update_user",
        category: "user",
        severity: getSeverityForAction("update_user"),
        description: `Membresía de ${user.email} cambiada a ${tier}`,
        targetModel: "User",
        targetId: user.id,
        targetIdentifier: user.email,
        metadata: { tier, durationDays },
      });

      res.json({
        success: true,
        message: `Membresía actualizada a ${tier}`,
        data: { membershipTier: user.membershipTier, membershipExpiresAt: user.membershipExpiresAt },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Error del servidor" });
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

// @route   POST /api/admin/users/:id/verify
// @desc    Verificar o revocar verificación de identidad de un usuario
// @access  Admin+
router.post(
  "/:id/verify",
  requirePermission("users:write"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { verified = true } = req.body;
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ["password", "twoFactorSecret", "twoFactorBackupCodes"] },
      });

      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      const adminUser = await User.findByPk(req.user!.id, { attributes: ['id', 'name', 'email', 'adminRole'] });

      // Store who verified in legalInfo JSONB (no migration needed)
      const currentLegalInfo = (user as any).legalInfo || {};
      const verificationMeta = verified
        ? { adminVerifiedBy: req.user!.id, adminVerifiedByName: adminUser?.name || 'Admin', adminVerifiedAt: new Date().toISOString() }
        : { adminVerifiedBy: null, adminVerifiedByName: null, adminVerifiedAt: null };

      await user.update({
        dniVerified: Boolean(verified),
        verificationLevel: verified ? "document" : "email",
        legalInfo: { ...currentLegalInfo, ...verificationMeta },
      });

      await logAudit({
        req,
        action: verified ? "verify_user" : "revoke_user_verification",
        category: "user",
        severity: "medium",
        description: `Verificación de identidad ${verified ? "aprobada" : "revocada"} para ${user.email} por ${adminUser?.name}`,
        targetModel: "User",
        targetId: user.id,
        targetIdentifier: user.email,
      });

      res.json({
        success: true,
        message: verified ? "Usuario verificado correctamente" : "Verificación revocada",
        data: { dniVerified: user.dniVerified, verificationLevel: user.verificationLevel, legalInfo: user.legalInfo },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Error del servidor" });
    }
  }
);

// @route   GET /api/admin/users/:id/profile-detail
// @desc    Obtener detalles completos del perfil de un usuario (para verificación)
// @access  Admin+
router.get(
  "/:id/profile-detail",
  requirePermission("users:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ["password", "twoFactorSecret", "twoFactorBackupCodes"] },
      });

      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      const [jobs, contracts] = await Promise.all([
        Job.findAll({ where: { clientId: req.params.id }, order: [["createdAt", "DESC"]], limit: 10,
          attributes: ["id", "title", "status", "price", "createdAt"] }),
        Contract.findAll({
          where: { [Op.or]: [{ clientId: req.params.id }, { doerId: req.params.id }] },
          order: [["createdAt", "DESC"]], limit: 10,
          attributes: ["id", "status", "price", "createdAt"],
        }),
      ]);

      res.json({
        success: true,
        data: {
          user: user.toJSON(),
          jobs: jobs.map((j: any) => ({ id: j.id, title: j.title, status: j.status, price: j.price, createdAt: j.createdAt })),
          contracts: contracts.map((c: any) => ({ id: c.id, status: c.status, price: c.price, createdAt: c.createdAt })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Error del servidor" });
    }
  }
);

// @route   POST /api/admin/users/:id/approve-license
// @desc    Aprobar matrícula/licencia de un usuario
// @access  Admin+
router.post(
  "/:id/approve-license",
  requirePermission("users:write"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ success: false, message: "ID inválido" });
        return;
      }
      const user = await User.findByPk(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }
      if (!user.licenseNumber && !user.licenseDocumentUrl) {
        res.status(400).json({ success: false, message: "El usuario no tiene matrícula para aprobar" });
        return;
      }

      await user.update({
        licenseVerified: true,
        licenseVerificationStatus: 'approved',
        licenseRejectedReason: undefined,
        licenseVerifiedBy: req.user!.id,
        licenseVerifiedAt: new Date(),
      });

      await logAudit({
        req,
        action: 'license_approved',
        category: 'user',
        severity: 'medium',
        description: `Matrícula de ${user.email} aprobada`,
        targetModel: 'User',
        targetId: user.id,
        targetIdentifier: user.email,
      });

      // In-app notification
      try {
        const { Notification } = await import('../../models/sql/Notification.model.js');
        const { socketService } = await import('../../index.js');
        const notif = await Notification.create({
          recipientId: user.id,
          title: 'Matrícula aprobada',
          message: 'Tu matrícula profesional fue verificada y aprobada por el equipo de DOAPP.',
          type: 'success',
          category: 'account',
          actionText: 'Ver mi perfil',
          data: { tab: 'profession' },
        });
        socketService.notifyUser(user.id, 'notification:new', notif.toJSON());
      } catch (notifErr) {
        console.error('Error sending license approval notification:', notifErr);
      }

      res.json({ success: true, message: "Matrícula aprobada correctamente" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Error del servidor" });
    }
  }
);

// @route   POST /api/admin/users/:id/reject-license
// @desc    Rechazar matrícula/licencia de un usuario (con motivo + email)
// @access  Admin+
router.post(
  "/:id/reject-license",
  requirePermission("users:write"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ success: false, message: "ID inválido" });
        return;
      }
      const { reason } = req.body;
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        res.status(400).json({ success: false, message: "El motivo de rechazo es obligatorio" });
        return;
      }

      const user = await User.findByPk(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      await user.update({
        licenseVerified: false,
        licenseVerificationStatus: 'rejected',
        licenseRejectedReason: reason.trim(),
        licenseVerifiedBy: req.user!.id,
        licenseVerifiedAt: new Date(),
      });

      await logAudit({
        req,
        action: 'license_rejected',
        category: 'user',
        severity: 'medium',
        description: `Matrícula de ${user.email} rechazada. Motivo: ${reason.trim()}`,
        targetModel: 'User',
        targetId: user.id,
        targetIdentifier: user.email,
      });

      // Send email notification
      try {
        const emailService = (await import('../../services/email.js')).default;
        await emailService.sendEmail({
          to: user.email,
          subject: 'Tu matrícula profesional fue revisada',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ef4444;">Matrícula no aprobada</h2>
              <p>Hola <strong>${user.name}</strong>,</p>
              <p>Tu matrícula/documento profesional fue revisado por nuestro equipo y lamentablemente no pudo ser aprobado.</p>
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0; border-radius: 4px;">
                <strong>Motivo:</strong> ${reason.trim()}
              </div>
              <p>Por favor, actualizá los documentos en tu perfil y volvé a enviarlos para revisión.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=profession"
                 style="display: inline-block; background: #0ea5e9; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 8px;">
                Ir a configuración de profesión
              </a>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Error sending license rejection email:', emailErr);
      }

      // In-app notification
      try {
        const { Notification } = await import('../../models/sql/Notification.model.js');
        const { socketService } = await import('../../index.js');
        const notif = await Notification.create({
          recipientId: user.id,
          title: 'Matrícula no aprobada',
          message: `Tu matrícula profesional fue rechazada. Motivo: ${reason.trim()}`,
          type: 'warning',
          category: 'account',
          actionText: 'Actualizar documentos',
          data: { tab: 'profession' },
        });
        socketService.notifyUser(user.id, 'notification:new', notif.toJSON());
      } catch (notifErr) {
        console.error('Error sending license rejection notification:', notifErr);
      }

      res.json({ success: true, message: "Matrícula rechazada. El usuario fue notificado por email y notificación." });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Error del servidor" });
    }
  }
);

export default router;
