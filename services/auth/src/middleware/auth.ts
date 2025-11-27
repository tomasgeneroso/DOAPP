import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.model.js';
import { sessions } from '../redis.js';

export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}

interface JwtPayload {
  id: string;
  iat: number;
  exp: number;
}

/**
 * Middleware to protect routes - requires valid JWT
 */
export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Get token from header or cookie
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No autorizado - Token no proporcionado',
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Get user
    const user = await User.findByPk(decoded.id);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({
        success: false,
        message: 'Tu cuenta ha sido suspendida',
        reason: user.banReason,
      });
      return;
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    res.status(401).json({
      success: false,
      message: 'Token inválido',
    });
  }
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.adminRole) {
    res.status(403).json({
      success: false,
      message: 'Acceso denegado - Se requiere rol de administrador',
    });
    return;
  }
  next();
};

/**
 * Rate limiter for auth endpoints
 */
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  message: {
    success: false,
    message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
