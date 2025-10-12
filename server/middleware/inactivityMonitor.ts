import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/index.js";
import User from "../models/User.js";

// Configuración de inactividad (en milisegundos)
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutos
const WARNING_BEFORE_LOGOUT = 5 * 60 * 1000; // 5 minutos antes

export interface InactivityStatus {
  lastActivity: Date;
  isInactive: boolean;
  warningIssued: boolean;
  shouldLogout: boolean;
}

// Map para almacenar última actividad por usuario
const userActivity = new Map<string, Date>();

/**
 * Middleware para tracking de actividad del usuario
 */
export const trackActivity = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user && req.user._id) {
      const userId = req.user._id.toString();
      userActivity.set(userId, new Date());

      // Actualizar última actividad en la base de datos de forma asíncrona (no bloqueante)
      User.findByIdAndUpdate(userId, {
        lastActivity: new Date(),
      }).catch((err) => console.error("Error updating last activity:", err));
    }

    next();
  } catch (error) {
    next();
  }
};

/**
 * Obtener estado de inactividad de un usuario
 */
export const getInactivityStatus = (userId: string): InactivityStatus => {
  const lastActivity = userActivity.get(userId);

  if (!lastActivity) {
    return {
      lastActivity: new Date(),
      isInactive: false,
      warningIssued: false,
      shouldLogout: false,
    };
  }

  const now = new Date().getTime();
  const lastActivityTime = lastActivity.getTime();
  const inactiveTime = now - lastActivityTime;

  return {
    lastActivity,
    isInactive: inactiveTime > INACTIVITY_TIMEOUT,
    warningIssued:
      inactiveTime > INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT &&
      inactiveTime < INACTIVITY_TIMEOUT,
    shouldLogout: inactiveTime > INACTIVITY_TIMEOUT,
  };
};

/**
 * Middleware para verificar inactividad
 */
export const checkInactivity = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user && req.user._id) {
      const userId = req.user._id.toString();
      const status = getInactivityStatus(userId);

      if (status.shouldLogout) {
        // Limpiar actividad del usuario
        userActivity.delete(userId);

        res.status(401).json({
          success: false,
          message: "Sesión cerrada por inactividad",
          code: "INACTIVE_SESSION",
        });
        return;
      }

      // Agregar información de inactividad a los headers
      if (status.warningIssued) {
        res.setHeader("X-Inactivity-Warning", "true");
        res.setHeader(
          "X-Inactivity-Remaining",
          Math.floor((INACTIVITY_TIMEOUT - (new Date().getTime() - status.lastActivity.getTime())) / 1000).toString()
        );
      }
    }

    next();
  } catch (error) {
    next();
  }
};

/**
 * Limpiar actividad de un usuario (usado en logout)
 */
export const clearUserActivity = (userId: string): void => {
  userActivity.delete(userId);
};

/**
 * Obtener configuración de inactividad
 */
export const getInactivityConfig = () => ({
  timeout: INACTIVITY_TIMEOUT,
  warningBefore: WARNING_BEFORE_LOGOUT,
  timeoutMinutes: INACTIVITY_TIMEOUT / 60000,
  warningMinutes: WARNING_BEFORE_LOGOUT / 60000,
});

// Limpiar actividades antiguas cada hora
setInterval(() => {
  const now = new Date().getTime();
  const entries = Array.from(userActivity.entries());

  for (const [userId, lastActivity] of entries) {
    const inactiveTime = now - lastActivity.getTime();

    // Eliminar usuarios inactivos por más de 2 horas
    if (inactiveTime > INACTIVITY_TIMEOUT * 4) {
      userActivity.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Cada hora
