import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config/env.js";
import User from "../models/User.js";
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

    // Obtener token del header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    // O del cookie
    else if (req.cookies.token) {
      token = req.cookies.token;
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

      // Agregar usuario al request
      req.user = await User.findById(decoded.id).select("-password");

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

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `El rol ${req.user.role} no tiene permiso para acceder a esta ruta`,
      });
      return;
    }

    next();
  };
};
