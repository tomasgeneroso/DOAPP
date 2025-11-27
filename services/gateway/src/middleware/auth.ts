import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    adminRole?: string;
  };
}

/**
 * Middleware to validate JWT tokens
 * Does NOT block requests - just attaches user info if valid
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1] || req.cookies?.token;

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      adminRole: decoded.adminRole,
    };
  } catch (error) {
    // Token invalid - continue without user
  }

  next();
}

/**
 * Middleware to require authentication
 * Blocks requests without valid JWT
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1] || req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No autorizado - Token no proporcionado',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      adminRole: decoded.adminRole,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'No autorizado - Token inválido',
    });
  }
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autorizado',
    });
  }

  const validAdminRoles = ['owner', 'super_admin', 'admin', 'marketing', 'support', 'dpo'];
  if (!req.user.adminRole || !validAdminRoles.includes(req.user.adminRole)) {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado - Se requiere rol de administrador',
    });
  }

  next();
}
