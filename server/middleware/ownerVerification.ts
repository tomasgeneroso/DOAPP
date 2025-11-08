import { Response, NextFunction } from "express";
import { User } from "../models/sql/User.model.js";
import type { AuthRequest } from "../types/index.js";

/**
 * Middleware para verificar la contraseña del owner en acciones críticas
 * Se espera que el body contenga el campo 'ownerPassword'
 */
export const verifyOwnerPassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "No autenticado",
      });
      return;
    }

    // Solo el owner necesita verificar contraseña
    if (req.user.adminRole !== "owner") {
      res.status(403).json({
        success: false,
        message: "Esta acción solo puede ser realizada por el owner",
      });
      return;
    }

    const { ownerPassword } = req.body;

    if (!ownerPassword) {
      res.status(400).json({
        success: false,
        message: "Se requiere la contraseña del owner para esta acción crítica",
        requiresPassword: true,
      });
      return;
    }

    // Obtener usuario con contraseña
    const user = await User.findByPk(req.user._id).select("+password");

    if (!user || !user.password) {
      res.status(401).json({
        success: false,
        message: "Usuario no encontrado o sin contraseña",
      });
      return;
    }

    // Verificar contraseña
    const isMatch = await user.comparePassword(ownerPassword);

    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: "Contraseña incorrecta",
      });
      return;
    }

    // Marcar en la request que la contraseña fue verificada (para audit log)
    req.passwordVerified = true;

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
};

/**
 * Middleware opcional para verificar 2FA si está habilitado
 */
export const verify2FA = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "No autenticado",
      });
      return;
    }

    // Si el usuario no tiene 2FA habilitado, continuar
    if (!req.user.twoFactorEnabled) {
      next();
      return;
    }

    const { twoFactorCode } = req.body;

    if (!twoFactorCode) {
      res.status(400).json({
        success: false,
        message: "Se requiere código de autenticación de dos factores",
        requires2FA: true,
      });
      return;
    }

    // Obtener usuario con secret de 2FA
    const user = await User.findByPk(req.user._id).select("+twoFactorSecret");

    if (!user || !user.twoFactorSecret) {
      res.status(401).json({
        success: false,
        message: "2FA no configurado correctamente",
      });
      return;
    }

    // Verificar el código (esto lo implementamos en las rutas de 2FA)
    const speakeasy = await import("speakeasy");
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: twoFactorCode,
      window: 2, // Permite 2 períodos de tiempo de diferencia
    });

    if (!verified) {
      res.status(401).json({
        success: false,
        message: "Código de autenticación inválido",
      });
      return;
    }

    // Marcar en la request que 2FA fue verificado (para audit log)
    req.twoFactorVerified = true;

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
};

/**
 * Middleware combinado: verifica contraseña y 2FA si está habilitado
 */
export const verifyCriticalAction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Primero verificar contraseña
  await verifyOwnerPassword(req, res, async () => {
    // Si pasa, verificar 2FA si está habilitado
    await verify2FA(req, res, next);
  });
};
