import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config/env.js";
import { User } from "../models/sql/User.model.js";
import type { AuthRequest } from "../types/index.js";

export type { AuthRequest };

interface DecodedToken extends JwtPayload {
  id: string;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token;

    // Prioridad 1: Obtener token de la cookie httpOnly (más seguro)
    if (req.cookies.token) {
      token = req.cookies.token;
    }
    // Prioridad 2: Fallback al header Authorization para compatibilidad
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Verificar que el token exista
    if (!token) {
      res.status(401).json({
        success: false,
        message: "No autorizado para acceder a esta ruta",
      });
      return;
    }

    try {
      // Verificar token
      const decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;

      // Agregar usuario al request (PostgreSQL/Sequelize)
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        message: "Token inválido o expirado",
      });
      return;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error del servidor en autenticación",
    });
  }
};

// Middleware para verificar roles
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
      return;
    }

    // Define admin roles that should check adminRole field
    const adminRoles = ['owner', 'super_admin', 'admin', 'support', 'marketing', 'dpo', 'moderator'];

    // Check if all requested roles are admin roles
    const isAdminRoleCheck = roles.every(r => adminRoles.includes(r));

    // Verify role or adminRole depending on context
    const hasRole = isAdminRoleCheck
      ? (req.user.adminRole && roles.includes(req.user.adminRole))
      : roles.includes(req.user.role);

    if (!hasRole) {
      const currentRole = isAdminRoleCheck ? req.user.adminRole : req.user.role;
      res.status(403).json({
        success: false,
        message: `El rol ${currentRole || 'sin asignar'} no tiene permiso para acceder a esta ruta`,
      });
      return;
    }

    next();
  };
};
