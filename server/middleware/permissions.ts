import { Response, NextFunction } from "express";
import type { AuthRequest } from "../types/index.js";

// Permisos predefinidos por rol
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    "*", // Todos los permisos
  ],
  super_admin: [
    "users:read",
    "users:update",
    "users:ban",
    "users:unban",
    "contracts:read",
    "contracts:update",
    "contracts:ban",
    "contracts:unban",
    "tickets:read",
    "tickets:create",
    "tickets:update",
    "tickets:assign",
    "tickets:close",
    "roles:read",
    "roles:create",
    "roles:update",
    "roles:delete",
    "permissions:read",
    "permissions:assign",
    "audit:read",
    "audit:export",
    "analytics:read",
    "analytics:export",
  ],
  admin: [
    "users:read",
    "users:ban",
    "users:unban",
    "contracts:read",
    "contracts:ban",
    "contracts:unban",
    "tickets:read",
    "tickets:create",
    "tickets:update",
    "tickets:assign",
    "tickets:close",
    "audit:read",
    "analytics:read",
  ],
  support: [
    "users:read",
    "contracts:read",
    "tickets:read",
    "tickets:create",
    "tickets:update",
    "tickets:close",
  ],
  marketing: [
    "analytics:read",
    "analytics:export",
  ],
};

// Verificar si el usuario tiene un admin role
export const requireAdminRole = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "No autenticado",
    });
    return;
  }

  if (!req.user.adminRole) {
    res.status(403).json({
      success: false,
      message: "Acceso denegado: Se requiere rol administrativo",
    });
    return;
  }

  next();
};

// Verificar rol específico
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.adminRole) {
      res.status(403).json({
        success: false,
        message: "Acceso denegado: Se requiere rol administrativo",
      });
      return;
    }

    if (!roles.includes(req.user.adminRole)) {
      res.status(403).json({
        success: false,
        message: `Acceso denegado: Se requiere uno de los siguientes roles: ${roles.join(", ")}`,
      });
      return;
    }

    next();
  };
};

// Verificar permiso específico
export const requirePermission = (...permissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.adminRole) {
      res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
      return;
    }

    // Owner tiene todos los permisos
    if (req.user.adminRole === "owner") {
      next();
      return;
    }

    // Obtener permisos del rol
    const rolePermissions = ROLE_PERMISSIONS[req.user.adminRole] || [];

    // Combinar con permisos personalizados del usuario
    const userPermissions = [...rolePermissions, ...(req.user.permissions || [])];

    // Verificar si tiene alguno de los permisos requeridos
    const hasPermission = permissions.some((permission) => {
      return userPermissions.includes(permission) || userPermissions.includes("*");
    });

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: `Acceso denegado: Se requiere uno de los siguientes permisos: ${permissions.join(", ")}`,
      });
      return;
    }

    next();
  };
};

// Verificar que el usuario no esté baneado
export const checkBanStatus = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "No autenticado",
    });
    return;
  }

  if (req.user.isBanned) {
    // Verificar si el ban tiene fecha de expiración
    if (req.user.banExpiresAt && new Date() > new Date(req.user.banExpiresAt)) {
      // El ban expiró, continuar
      next();
      return;
    }

    res.status(403).json({
      success: false,
      message: `Tu cuenta ha sido suspendida. Razón: ${req.user.banReason || "No especificada"}`,
      banExpiresAt: req.user.banExpiresAt,
    });
    return;
  }

  next();
};

// Helper para verificar permisos programáticamente
export const hasPermission = (user: any, permission: string): boolean => {
  if (!user || !user.adminRole) {
    return false;
  }

  if (user.adminRole === "owner") {
    return true;
  }

  const rolePermissions = ROLE_PERMISSIONS[user.adminRole] || [];
  const userPermissions = [...rolePermissions, ...(user.permissions || [])];

  return userPermissions.includes(permission) || userPermissions.includes("*");
};

// Exportar permisos por rol para uso en frontend
export { ROLE_PERMISSIONS };
