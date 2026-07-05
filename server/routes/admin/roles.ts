import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { User } from "../../models/sql/User.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import type { AuthRequest } from "../../types/index.js";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../../config/permissions.js";
import { logAudit } from "../../utils/auditLog.js";
import {
  verifyRolePassword,
  setRolePassword,
  hasRolePassword,
  hasEmergencyPassword,
  verifyEmergencyPassword,
  setEmergencyPassword,
  createResetToken,
  verifyResetToken,
  consumeResetToken,
} from "../../utils/rolePasswordStore.js";
import emailService from "../../services/email.js";
import { Op } from 'sequelize';

const router = Router();

// All routes require admin authentication
router.use(protect);
router.use(requirePermission("role:view"));

/**
 * GET /api/admin/roles/permissions
 * Get all available permissions and role definitions
 */
router.get("/permissions", async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        roles: [
          {
            id: "owner",
            name: "Owner",
            description: "Full system access, cannot be assigned",
            permissions: ROLE_PERMISSIONS.owner,
          },
          {
            id: "super_admin",
            name: "Super Admin",
            description: "Full administrative access except owner functions",
            permissions: ROLE_PERMISSIONS.super_admin,
          },
          {
            id: "admin",
            name: "Admin",
            description: "General administrative access",
            permissions: ROLE_PERMISSIONS.admin,
          },
          {
            id: "support",
            name: "Support",
            description: "Customer support and ticket management",
            permissions: ROLE_PERMISSIONS.support,
          },
          {
            id: "marketing",
            name: "Marketing",
            description: "Marketing and content management",
            permissions: ROLE_PERMISSIONS.marketing,
          },
          {
            id: "dpo",
            name: "Data Protection Officer",
            description: "Privacy and data protection management",
            permissions: ROLE_PERMISSIONS.dpo,
          },
        ],
        allPermissions: [
          // User Management
          { id: PERMISSIONS.USER_VIEW, category: "Users", description: "View users" },
          { id: PERMISSIONS.USER_EDIT_OWN, category: "Users", description: "Edit own profile" },
          { id: PERMISSIONS.USER_EDIT_ANY, category: "Users", description: "Edit any user" },
          { id: PERMISSIONS.USER_DELETE_OWN, category: "Users", description: "Delete own account" },
          { id: PERMISSIONS.USER_DELETE_ANY, category: "Users", description: "Delete any user" },
          { id: PERMISSIONS.USER_BAN, category: "Users", description: "Ban users" },
          { id: PERMISSIONS.USER_UNBAN, category: "Users", description: "Unban users" },

          // Contract Management
          { id: PERMISSIONS.CONTRACT_CREATE, category: "Contracts", description: "Create contracts" },
          { id: PERMISSIONS.CONTRACT_VIEW_OWN, category: "Contracts", description: "View own contracts" },
          { id: PERMISSIONS.CONTRACT_VIEW_ANY, category: "Contracts", description: "View any contract" },
          { id: PERMISSIONS.CONTRACT_EDIT_OWN, category: "Contracts", description: "Edit own contracts" },
          { id: PERMISSIONS.CONTRACT_EDIT_ANY, category: "Contracts", description: "Edit any contract" },
          { id: PERMISSIONS.CONTRACT_DELETE_OWN, category: "Contracts", description: "Delete own contracts" },
          { id: PERMISSIONS.CONTRACT_DELETE_ANY, category: "Contracts", description: "Delete any contract" },
          { id: PERMISSIONS.CONTRACT_MODERATE, category: "Contracts", description: "Moderate contracts" },

          // Payment Management
          { id: PERMISSIONS.PAYMENT_CREATE, category: "Payments", description: "Create payments" },
          { id: PERMISSIONS.PAYMENT_VIEW_OWN, category: "Payments", description: "View own payments" },
          { id: PERMISSIONS.PAYMENT_VIEW_ANY, category: "Payments", description: "View any payment" },
          { id: PERMISSIONS.PAYMENT_REFUND, category: "Payments", description: "Issue refunds" },
          { id: PERMISSIONS.PAYMENT_MANAGE, category: "Payments", description: "Manage payments" },

          // Ticket Management
          { id: PERMISSIONS.TICKET_CREATE, category: "Tickets", description: "Create tickets" },
          { id: PERMISSIONS.TICKET_VIEW_OWN, category: "Tickets", description: "View own tickets" },
          { id: PERMISSIONS.TICKET_VIEW_ANY, category: "Tickets", description: "View any ticket" },
          { id: PERMISSIONS.TICKET_ASSIGN, category: "Tickets", description: "Assign tickets" },
          { id: PERMISSIONS.TICKET_RESOLVE, category: "Tickets", description: "Resolve tickets" },
          { id: PERMISSIONS.TICKET_DELETE, category: "Tickets", description: "Delete tickets" },

          // Dispute Management
          { id: PERMISSIONS.DISPUTE_CREATE, category: "Disputes", description: "Create disputes" },
          { id: PERMISSIONS.DISPUTE_VIEW_OWN, category: "Disputes", description: "View own disputes" },
          { id: PERMISSIONS.DISPUTE_VIEW_ANY, category: "Disputes", description: "View any dispute" },
          { id: PERMISSIONS.DISPUTE_ASSIGN, category: "Disputes", description: "Assign disputes" },
          { id: PERMISSIONS.DISPUTE_RESOLVE, category: "Disputes", description: "Resolve disputes" },
          { id: PERMISSIONS.DISPUTE_DELETE, category: "Disputes", description: "Delete disputes" },

          // Admin Permissions
          { id: PERMISSIONS.ADMIN_DASHBOARD, category: "Admin", description: "Access admin dashboard" },
          { id: PERMISSIONS.ADMIN_ANALYTICS, category: "Admin", description: "View analytics" },
          { id: PERMISSIONS.ADMIN_AUDIT_LOG, category: "Admin", description: "View audit logs" },
          { id: PERMISSIONS.ADMIN_SETTINGS, category: "Admin", description: "Manage settings" },

          // Role Management
          { id: PERMISSIONS.ROLE_VIEW, category: "Roles", description: "View roles" },
          { id: PERMISSIONS.ROLE_CREATE, category: "Roles", description: "Create roles" },
          { id: PERMISSIONS.ROLE_EDIT, category: "Roles", description: "Edit roles" },
          { id: PERMISSIONS.ROLE_DELETE, category: "Roles", description: "Delete roles" },
          { id: PERMISSIONS.ROLE_ASSIGN, category: "Roles", description: "Assign roles" },

          // System Management
          { id: PERMISSIONS.SYSTEM_BACKUP, category: "System", description: "Backup system" },
          { id: PERMISSIONS.SYSTEM_RESTORE, category: "System", description: "Restore system" },
          { id: PERMISSIONS.SYSTEM_MAINTENANCE, category: "System", description: "Maintenance mode" },

          // Privacy & Data Protection
          { id: PERMISSIONS.PRIVACY_VIEW_CONSENTS, category: "Privacy", description: "View consents" },
          { id: PERMISSIONS.PRIVACY_VIEW_DATA_ACCESS, category: "Privacy", description: "View data access" },
          { id: PERMISSIONS.PRIVACY_EXPORT_DATA, category: "Privacy", description: "Export user data" },
          { id: PERMISSIONS.PRIVACY_DELETE_DATA, category: "Privacy", description: "Delete user data" },
          { id: PERMISSIONS.PRIVACY_MANAGE_REQUESTS, category: "Privacy", description: "Manage GDPR requests" },
          { id: PERMISSIONS.PRIVACY_VIEW_AUDIT, category: "Privacy", description: "View privacy audit" },
          { id: PERMISSIONS.PRIVACY_COMPLIANCE_REPORT, category: "Privacy", description: "Compliance reports" },

          // Blog Management
          { id: PERMISSIONS.BLOG_VIEW, category: "Blog", description: "View blog posts" },
          { id: PERMISSIONS.BLOG_CREATE, category: "Blog", description: "Create blog posts" },
          { id: PERMISSIONS.BLOG_EDIT, category: "Blog", description: "Edit blog posts" },
          { id: PERMISSIONS.BLOG_DELETE, category: "Blog", description: "Delete blog posts" },
          { id: PERMISSIONS.BLOG_MANAGE, category: "Blog", description: "Manage blog" },
          { id: PERMISSIONS.BLOG_PUBLISH, category: "Blog", description: "Publish blog posts" },
        ],
      },
    });
  } catch (error: any) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener permisos",
    });
  }
});

/**
 * GET /api/admin/roles/users
 * Get all users with their roles and permissions
 */
router.get("/users", async (req: AuthRequest, res: Response) => {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;

    const filter: any = {};

    // Filter by admin role
    if (role && role !== "all") {
      filter.adminRole = role;
    }

    // Search by name or email
    if (search) {
      filter[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count: total, rows: users } = await User.findAndCountAll({
      where: filter,
      attributes: ['id', 'name', 'email', 'avatar', 'adminRole', 'permissions', 'role', 'isVerified', 'isBanned', 'createdAt', 'lastLogin'],
      order: [['createdAt', 'DESC']],
      offset,
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener usuarios",
    });
  }
});

/**
 * PUT /api/admin/roles/users/:userId/role
 * Assign or update admin role for a user
 */
router.put(
  "/users/:userId/role",
  [
    body("adminRole")
      .optional()
      .isIn(["owner", "super_admin", "admin", "support", "marketing", "dpo", "none"])
      .withMessage("Invalid admin role"),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { userId } = req.params;
      const { adminRole, rolePassword } = req.body;

      // Check permissions
      const adminUser = await User.findByPk(req.user.id);
      if (!adminUser) {
        return res.status(404).json({ success: false, message: "Admin no encontrado" });
      }

      // owner role: only current owner can assign, requires owner password
      if (adminRole === "owner") {
        if (adminUser.adminRole !== "owner") {
          return res.status(403).json({
            success: false,
            message: "Solo el owner puede asignar el rol de owner",
          });
        }
        if (!rolePassword) {
          return res.status(403).json({
            success: false,
            message: "Se requiere la contraseña de owner para asignar este rol",
            requiresPassword: true,
            passwordRole: "owner",
          });
        }
        const validPassword = await verifyRolePassword("owner", rolePassword);
        if (!validPassword) {
          return res.status(403).json({
            success: false,
            message: "Contraseña de owner incorrecta",
          });
        }
      }

      // admin role: requires admin password
      if (adminRole === "admin") {
        if (!rolePassword) {
          return res.status(403).json({
            success: false,
            message: "Se requiere la contraseña de admin para asignar este rol",
            requiresPassword: true,
            passwordRole: "admin",
          });
        }
        const validPassword = await verifyRolePassword("admin", rolePassword);
        if (!validPassword) {
          return res.status(403).json({
            success: false,
            message: "Contraseña de admin incorrecta",
          });
        }
      }

      // Only owner and super_admin can assign super_admin role
      if (
        adminRole === "super_admin" &&
        adminUser.adminRole !== "owner" &&
        adminUser.adminRole !== "super_admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para asignar el rol de Super Admin",
        });
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
      }

      // Cannot modify owner
      if (user.adminRole === "owner") {
        return res.status(403).json({
          success: false,
          message: "No se puede modificar el rol del owner",
        });
      }

      // Update role
      const previousRole = user.adminRole;
      if (adminRole === "none" || adminRole === null) {
        user.adminRole = null as any;
        user.permissions = [];
      } else {
        user.adminRole = adminRole;
        // Assign default permissions for the role
        user.permissions = (ROLE_PERMISSIONS as any)[adminRole] || [];
      }

      await user.save();

      // Create audit log
      await logAudit({
        req,
        action: "role_assigned",
        category: "role",
        severity: "high",
        description: `Rol cambiado de ${previousRole || "ninguno"} a ${adminRole === "none" ? "ninguno" : adminRole} para ${user.email}`,
        metadata: {
          targetUserId: user.id,
          previousRole,
          newRole: adminRole === "none" ? null : adminRole,
          permissions: user.permissions,
        },
      });

      res.json({
        success: true,
        message: "Rol actualizado exitosamente",
        data: {
          user: {
            _id: user.id,
            name: user.name,
            email: user.email,
            adminRole: user.adminRole,
            permissions: user.permissions,
          },
        },
      });
    } catch (error: any) {
      console.error("Error assigning role:", error);
      res.status(500).json({
        success: false,
        message: "Error al asignar rol",
      });
    }
  }
);

/**
 * PUT /api/admin/roles/users/:userId/permissions
 * Update custom permissions for a user
 */
router.put(
  "/users/:userId/permissions",
  [
    body("permissions")
      .isArray()
      .withMessage("Permissions must be an array"),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { userId } = req.params;
      const { permissions } = req.body;

      // Only owner and super_admin can modify permissions
      const adminUser = await User.findByPk(req.user.id);
      if (
        !adminUser ||
        (adminUser.adminRole !== "owner" && adminUser.adminRole !== "super_admin")
      ) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para modificar permisos personalizados",
        });
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
      }

      // Cannot modify owner
      if (user.adminRole === "owner") {
        return res.status(403).json({
          success: false,
          message: "No se pueden modificar los permisos del owner",
        });
      }

      const previousPermissions = [...user.permissions];
      user.permissions = permissions;
      await user.save();

      // Create audit log
      await logAudit({
        req,
        action: "permissions_updated",
        category: "permission",
        severity: "high",
        description: `Permisos actualizados para ${user.email}`,
        metadata: {
          targetUserId: user.id,
          previousPermissions,
          newPermissions: permissions,
          addedPermissions: permissions.filter((p: string) => !previousPermissions.includes(p)),
          removedPermissions: previousPermissions.filter((p) => !permissions.includes(p)),
        },
      });

      res.json({
        success: true,
        message: "Permisos actualizados exitosamente",
        data: {
          user: {
            _id: user.id,
            name: user.name,
            email: user.email,
            adminRole: user.adminRole,
            permissions: user.permissions,
          },
        },
      });
    } catch (error: any) {
      console.error("Error updating permissions:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar permisos",
      });
    }
  }
);

/**
 * PUT /api/admin/roles/:roleId/permissions
 * Update predefined permissions for a role
 */
router.put(
  "/:roleId/permissions",
  [
    body("permissions")
      .isArray()
      .withMessage("Permissions must be an array"),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { roleId } = req.params;
      const { permissions } = req.body;

      // Check permissions
      const adminUser = await User.findByPk(req.user.id);
      if (!adminUser) {
        return res.status(404).json({
          success: false,
          message: "Admin no encontrado",
        });
      }

      // Only owner and super_admin can modify role permissions
      if (
        adminUser.adminRole !== "owner" &&
        adminUser.adminRole !== "super_admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para modificar permisos de roles",
        });
      }

      // Cannot modify owner role
      if (roleId === "owner") {
        return res.status(403).json({
          success: false,
          message: "No se pueden modificar los permisos del rol Owner",
        });
      }

      // Super admin cannot modify their own role
      if (adminUser.adminRole === "super_admin" && roleId === "super_admin") {
        return res.status(403).json({
          success: false,
          message: "No puedes modificar tu propio rol",
        });
      }

      // Validate roleId
      const validRoles = ["super_admin", "admin", "support", "marketing", "dpo"];
      if (!validRoles.includes(roleId)) {
        return res.status(400).json({
          success: false,
          message: "Rol inválido",
        });
      }

      // Update ROLE_PERMISSIONS configuration
      // Note: This would typically be stored in a database,
      // but for now we'll update it in memory
      // In production, you should store role permissions in a database

      // For now, we'll just update users who have this role
      const usersWithRole = await User.findAll({ where: { adminRole: roleId } });
      for (const user of usersWithRole) {
        user.permissions = permissions;
        await user.save();
      }

      // Create audit log
      await logAudit({
        req,
        action: "role_permissions_updated",
        category: "role",
        severity: "critical",
        description: `Permisos del rol ${roleId} actualizados`,
        metadata: {
          roleId,
          newPermissions: permissions,
          affectedUsers: usersWithRole.length,
        },
      });

      res.json({
        success: true,
        message: `Permisos del rol ${roleId} actualizados. ${usersWithRole.length} usuarios afectados.`,
        data: {
          roleId,
          permissions,
          affectedUsers: usersWithRole.length,
        },
      });
    } catch (error: any) {
      console.error("Error updating role permissions:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar permisos del rol",
      });
    }
  }
);

/**
 * GET /api/admin/roles/security/status
 * Check if role passwords are configured (owner only)
 */
router.get("/security/status", async (req: AuthRequest, res: Response) => {
  try {
    const adminUser = await User.findByPk(req.user.id);
    if (!adminUser || adminUser.adminRole !== "owner") {
      return res.status(403).json({ success: false, message: "Solo el owner puede acceder" });
    }
    res.json({
      success: true,
      data: {
        ownerPasswordSet: hasRolePassword("owner"),
        adminPasswordSet: hasRolePassword("admin"),
        emergencyPasswordSet: hasEmergencyPassword(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error al verificar contraseñas" });
  }
});

/**
 * PUT /api/admin/roles/security/passwords
 * Set/update role assignment passwords (owner only).
 *
 * First-time configuration (no password set yet) is allowed directly. To CHANGE an
 * already-configured password the caller must prove one of:
 *   - currentPassword: the current role password, OR
 *   - emergencyPassword: the configured emergency password, OR
 *   - resetToken: a one-time code emailed to the owner (see /reset-request).
 */
router.put(
  "/security/passwords",
  [
    body("role").isIn(["owner", "admin"]).withMessage("Role must be owner or admin"),
    body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error("Passwords do not match");
      return true;
    }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const adminUser = await User.findByPk(req.user.id);
      if (!adminUser || adminUser.adminRole !== "owner") {
        return res.status(403).json({ success: false, message: "Solo el owner puede configurar contraseñas de roles" });
      }

      const { role, newPassword, currentPassword, emergencyPassword, resetToken } = req.body;

      // Changing an EXISTING password requires proof; first-time setup does not.
      const alreadySet = hasRolePassword(role);
      let verifiedVia: string | null = null;
      if (alreadySet) {
        if (currentPassword && (await verifyRolePassword(role, currentPassword))) {
          verifiedVia = "current_password";
        } else if (emergencyPassword && hasEmergencyPassword() && (await verifyEmergencyPassword(emergencyPassword))) {
          verifiedVia = "emergency_password";
        } else if (resetToken && verifyResetToken(role, resetToken)) {
          verifiedVia = "email_reset_token";
        }

        if (!verifiedVia) {
          return res.status(401).json({
            success: false,
            requiresVerification: true,
            message:
              "Para cambiar una contraseña ya configurada necesitás la contraseña actual, la contraseña de emergencia, o un código enviado al correo del owner.",
          });
        }
      }

      await setRolePassword(role, newPassword);
      if (verifiedVia === "email_reset_token") consumeResetToken();

      await logAudit({
        req,
        action: "role_password_updated",
        category: "role",
        severity: "critical",
        description: `Contraseña de asignación para rol '${role}' actualizada`,
        metadata: { role, firstTime: !alreadySet, verifiedVia: verifiedVia || "first_time_setup" },
      });

      res.json({
        success: true,
        message: `Contraseña para rol '${role}' actualizada correctamente`,
      });
    } catch (error: any) {
      console.error("Error setting role password:", error);
      res.status(500).json({ success: false, message: "Error al actualizar contraseña" });
    }
  }
);

/**
 * PUT /api/admin/roles/security/emergency-password
 * Set/change the emergency password (owner only). Requires the owner's ACCOUNT
 * login password (not a role password) to authorize — so the emergency password
 * can only be rotated by someone who controls the owner account.
 */
router.put(
  "/security/emergency-password",
  [
    body("newPassword").isLength({ min: 10 }).withMessage("Emergency password must be at least 10 characters"),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error("Passwords do not match");
      return true;
    }),
    body("ownerAccountPassword").notEmpty().withMessage("Owner account password is required"),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const adminUser = await User.findByPk(req.user.id);
      if (!adminUser || adminUser.adminRole !== "owner") {
        return res.status(403).json({ success: false, message: "Solo el owner puede configurar la contraseña de emergencia" });
      }

      const { newPassword, ownerAccountPassword } = req.body;

      if (!adminUser.password || !(await adminUser.comparePassword(ownerAccountPassword))) {
        return res.status(401).json({ success: false, message: "Contraseña de la cuenta del owner incorrecta" });
      }

      const wasSet = hasEmergencyPassword();
      await setEmergencyPassword(newPassword);

      // The owner account password was verified above → reflect it in the audit trail.
      req.passwordVerified = true;
      await logAudit({
        req,
        action: wasSet ? "emergency_password_changed" : "emergency_password_set",
        category: "role",
        severity: "critical",
        description: `Contraseña de emergencia ${wasSet ? "cambiada" : "configurada"}`,
      });

      res.json({ success: true, message: "Contraseña de emergencia guardada correctamente" });
    } catch (error: any) {
      console.error("Error setting emergency password:", error);
      res.status(500).json({ success: false, message: "Error al guardar la contraseña de emergencia" });
    }
  }
);

/**
 * POST /api/admin/roles/security/reset-request
 * Emails a one-time code to the owner's account email so they can change a role
 * password without knowing the old one (owner only).
 */
router.post(
  "/security/reset-request",
  [body("role").isIn(["owner", "admin"]).withMessage("Role must be owner or admin")],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const adminUser = await User.findByPk(req.user.id);
      if (!adminUser || adminUser.adminRole !== "owner") {
        return res.status(403).json({ success: false, message: "Solo el owner puede solicitar un reset" });
      }
      if (!adminUser.email) {
        return res.status(400).json({ success: false, message: "El owner no tiene un email configurado" });
      }

      const { role } = req.body;
      const token = createResetToken(role, 30);

      await emailService.sendEmail({
        to: adminUser.email,
        subject: "Código para cambiar contraseña de rol · DOAPP",
        html: `
          <p>Hola ${adminUser.name || "owner"},</p>
          <p>Solicitaste cambiar la contraseña de asignación del rol <b>${role}</b> sin la contraseña actual.</p>
          <p>Tu código de verificación es:</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${token}</p>
          <p>Vence en 30 minutos. Si no fuiste vos, ignorá este correo y considerá revisar la seguridad de la cuenta.</p>
        `,
      });

      await logAudit({
        req,
        action: "role_password_reset_requested",
        category: "role",
        severity: "critical",
        description: `Código de reset de contraseña de rol '${role}' enviado al email del owner`,
        metadata: { role },
      });

      res.json({
        success: true,
        message: "Enviamos un código al correo del owner. Vence en 30 minutos.",
      });
    } catch (error: any) {
      console.error("Error requesting role password reset:", error);
      res.status(500).json({ success: false, message: "Error al enviar el código de reset" });
    }
  }
);

/**
 * GET /api/admin/roles/audit
 * Get role assignment audit logs
 */
router.get("/audit", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    // This would require an AuditLog model - for now return basic info
    // In a real implementation, you'd query the AuditLog model
    res.json({
      success: true,
      data: {
        logs: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          pages: 0,
        },
      },
      message: "Audit log functionality requires AuditLog model implementation",
    });
  } catch (error: any) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logs de auditoría",
    });
  }
});

export default router;
