import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config/env.js";
import { User } from "../models/sql/User.model.js";
import type { AuthRequest } from "../types/index.js";

export type { AuthRequest };

interface DecodedToken extends JwtPayload {
  id: string;
}

/** ¿La cuenta está baneada AHORA? Un baneo con fecha de vencimiento ya pasada no cuenta. */
export function estaBaneadoAhora(user: { isBanned?: boolean; banExpiresAt?: Date | string | null } | null | undefined): boolean {
  if (!user?.isBanned) return false;
  if (user.banExpiresAt && Date.now() > new Date(user.banExpiresAt).getTime()) return false;
  return true;
}

/**
 * Lo único que puede hacer una cuenta baneada: ver su estado, cerrar sesión y apelar con un ticket.
 * Es lo que necesita la pantalla /banned. Todo lo demás (retirar saldo, tomar trabajos, escribir en un
 * chat, pagar) queda cerrado en el servidor: antes el baneo sólo lo hacía cumplir la pantalla
 * (Layout.tsx redirigía a /banned) y la API seguía respondiendo igual que a cualquiera.
 */
const RUTAS_PERMITIDAS_CON_BANEO: Array<{ metodo: string; ruta: RegExp }> = [
  { metodo: 'GET', ruta: /^\/api\/auth\/(me|profile)\/?$/ },
  { metodo: 'POST', ruta: /^\/api\/auth\/logout\/?$/ },
  { metodo: 'GET', ruta: /^\/api\/tickets(\/[0-9a-f-]{36})?\/?$/i },
  { metodo: 'POST', ruta: /^\/api\/tickets\/?$/ },
  { metodo: 'POST', ruta: /^\/api\/tickets\/[0-9a-f-]{36}\/messages\/?$/i },
];

function rutaPermitidaConBaneo(req: AuthRequest): boolean {
  const ruta = String(req.originalUrl || '').split('?')[0];
  const metodo = String(req.method || '').toUpperCase();
  return RUTAS_PERMITIDAS_CON_BANEO.some((r) => r.metodo === metodo && r.ruta.test(ruta));
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token;

    /**
     * Prioridad 1: la cookie httpOnly (más segura que el header).
     *
     * El `?.` no es decorativo: si `cookie-parser` no corrió antes que este
     * middleware, `req.cookies` es undefined y leerlo tiraba un TypeError que
     * caía en el catch de abajo y devolvía **500 "Error del servidor en
     * autenticación"** a un pedido que simplemente no estaba autenticado. Un
     * 500 donde corresponde un 401 se lee como "el servidor está roto", manda
     * al usuario a soporte en vez de a iniciar sesión, y ensucia las alertas.
     */
    if (req.cookies?.token) {
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

      // Una cuenta baneada no opera: sólo ve su estado, cierra sesión y apela.
      if (estaBaneadoAhora(req.user as any) && !rutaPermitidaConBaneo(req)) {
        res.status(403).json({
          success: false,
          code: 'ACCOUNT_BANNED',
          banned: true,
          message: (req.user as any).banReason
            ? `Tu cuenta ha sido suspendida: ${(req.user as any).banReason}`
            : 'Tu cuenta ha sido suspendida',
          banExpiresAt: (req.user as any).banExpiresAt ?? null,
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

/**
 * Autenticación opcional: si hay token válido, carga req.user; si no, sigue
 * sin usuario y sin error.
 *
 * Para rutas públicas que devuelven MÁS a quien tiene derecho: el detalle de
 * un trabajo lo ve cualquiera, pero la dirección exacta de la casa la ve solo
 * el dueño y el trabajador contratado, y este último recién cerca del inicio.
 * Sin esto la ruta no puede distinguir a nadie y termina mostrando todo a
 * todos, que es lo que pasaba.
 */
export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;
    if (req.cookies?.token) token = req.cookies.token;
    else if (req.headers.authorization?.startsWith("Bearer")) token = req.headers.authorization.split(" ")[1];
    if (!token) return next();

    const decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;
    req.user = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
  } catch {
    // Token vencido o inválido: se trata como visitante. No es un error.
    req.user = undefined as any;
  }
  next();
};

// Middleware para verificar roles
/**
 * Gate an action behind identity verification (KYC). A user without a verified
 * identity can browse and use the blog, but cannot publish jobs, apply as a
 * Doer, or move money. Returns 403 with code KYC_REQUIRED so the client can
 * prompt the user to verify.
 */
export const requireKyc = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Usuario no autenticado" });
    return;
  }
  if (!(req.user as any).dniVerified) {
    res.status(403).json({
      success: false,
      code: "KYC_REQUIRED",
      message: "Necesitás verificar tu identidad para hacer esto. Verificala desde tu perfil.",
    });
    return;
  }
  next();
};

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
    const adminRoles = ['owner', 'super_admin', 'admin', 'support', 'marketing', 'dpo', 'moderator', 'analista'];

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

/**
 * Middleware that blocks requests from banned users.
 * Apply after `protect` on any route that should be blocked for banned users.
 */
export const checkNotBanned = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.isBanned) {
    const message = req.user.banReason
      ? `Tu cuenta ha sido suspendida: ${req.user.banReason}`
      : 'Tu cuenta ha sido suspendida';
    res.status(403).json({ success: false, message, banned: true });
    return;
  }
  next();
};

// Middleware específico para verificar roles de administrador
export const requireAdminRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
      return;
    }

    // Verificar que el usuario tenga un rol de admin
    if (!req.user.adminRole) {
      res.status(403).json({
        success: false,
        message: "Acceso denegado: se requiere rol de administrador",
      });
      return;
    }

    // Si se especificaron roles, verificar que coincida
    if (roles.length > 0 && !roles.includes(req.user.adminRole)) {
      res.status(403).json({
        success: false,
        message: `Acceso denegado: se requiere rol ${roles.join(' o ')}`,
      });
      return;
    }

    next();
  };
};
