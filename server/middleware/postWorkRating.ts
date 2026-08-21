import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { findPendingPostWorkRatings } from "../services/postWorkRating.js";

/**
 * Bloquea publicar o postularse mientras quede una puntuación post-trabajo
 * sin terminar. El front recibe el contrato pendiente para abrir la encuesta.
 */
export const requirePostWorkRating = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Usuario no autenticado" });
    return;
  }

  try {
    const pending = await findPendingPostWorkRatings(req.user.id, 1);

    if (pending.length > 0) {
      res.status(403).json({
        success: false,
        code: "PENDING_POST_WORK_RATING",
        message:
          "Tenés una puntuación pendiente de un trabajo anterior. Completala para poder continuar.",
        pending: pending[0],
      });
      return;
    }

    next();
  } catch (error: any) {
    // Ante un fallo del chequeo no bloqueamos la operación del usuario
    console.error("Error verificando puntuación post-trabajo:", error.message);
    next();
  }
};

export default requirePostWorkRating;
