import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/index";
import { ROLE_PERMISSIONS, hasPermission, hasAnyPermission, hasAllPermissions } from "../config/permissions";

/**
 * Middleware to check if user has required permission(s)
 * Can check for single permission, any of multiple permissions, or all of multiple permissions
 */
export const checkPermission = (
  permissions: string | string[],
  mode: "any" | "all" = "any"
) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
      return;
    }

    // Owner always has permission
    if (req.user.adminRole === "owner") {
      next();
      return;
    }

    // Get user's permissions from their role
    const userRole = (req.user.adminRole || "user") as keyof typeof ROLE_PERMISSIONS;
    const rolePermissions = ROLE_PERMISSIONS[userRole] || [];

    // Add custom permissions if any
    const userPermissions = [...rolePermissions, ...(req.user.permissions || [])];

    // Check permissions based on mode
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    let hasRequiredPermission = false;

    if (mode === "all") {
      hasRequiredPermission = hasAllPermissions(userPermissions, requiredPermissions);
    } else {
      hasRequiredPermission = hasAnyPermission(userPermissions, requiredPermissions);
    }

    if (!hasRequiredPermission) {
      console.warn(`[Permission Denied] User ${req.user._id} (${userRole}) attempted to access resource requiring: ${requiredPermissions.join(", ")}`);

      res.status(403).json({
        success: false,
        message: "No tienes permiso para realizar esta acción",
        required: requiredPermissions,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is admin (any admin role)
 */
export const isAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Usuario no autenticado",
    });
    return;
  }

  const adminRoles = ["owner", "super_admin", "admin", "support", "marketing"];

  if (!req.user.adminRole || !adminRoles.includes(req.user.adminRole)) {
    res.status(403).json({
      success: false,
      message: "Acceso denegado. Se requiere rol de administrador.",
    });
    return;
  }

  next();
};

/**
 * Middleware to check if user is owner
 */
export const isOwner = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Usuario no autenticado",
    });
    return;
  }

  if (req.user.adminRole !== "owner") {
    res.status(403).json({
      success: false,
      message: "Acceso denegado. Solo el propietario puede realizar esta acción.",
    });
    return;
  }

  next();
};

/**
 * Middleware to check if user is super admin or above
 */
export const isSuperAdminOrAbove = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Usuario no autenticado",
    });
    return;
  }

  const allowedRoles = ["owner", "super_admin"];

  if (!req.user.adminRole || !allowedRoles.includes(req.user.adminRole)) {
    res.status(403).json({
      success: false,
      message: "Acceso denegado. Se requiere rol de Super Admin o superior.",
    });
    return;
  }

  next();
};

export default {
  checkPermission,
  isAdmin,
  isOwner,
  isSuperAdminOrAbove,
};
