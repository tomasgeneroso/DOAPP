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

/**
 * Bloquea postularse a quien esta suspendido por la escalera de cancelaciones.
 *
 * Va como middleware y no como chequeo dentro de la ruta por la misma razon que
 * requirePostWorkRating: si algun dia aparece otra forma de postularse -- desde
 * el chat, desde una invitacion -- el bloqueo tiene que aplicar igual sin que
 * nadie se acuerde de copiarlo.
 *
 * Solo bloquea postulaciones nuevas. Los contratos en curso siguen: suspender
 * lo que ya esta andando castigaria al cliente de ese contrato, que no hizo
 * nada.
 */
export const requireNotSuspended = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Usuario no autenticado" });
    return;
  }

  try {
    const { suspendidoHasta } = await import("../services/cancellationLadder.js");
    const hasta = await suspendidoHasta(req.user.id);

    if (hasta) {
      res.status(403).json({
        success: false,
        code: "SUSPENDED_FROM_APPLYING",
        message:
          `No podés postularte hasta el ${hasta.toLocaleDateString('es-AR')} por haber cancelado ` +
          "varios trabajos aceptados. Los contratos que ya tenés en curso siguen igual.",
        suspendidoHasta: hasta,
      });
      return;
    }

    next();
  } catch (error: any) {
    // Un fallo al consultar no puede impedir postularse: fallar cerrado acá
    // dejaria a todos los trabajadores sin trabajo por un error de base.
    console.error("requireNotSuspended:", error?.message);
    next();
  }
};
