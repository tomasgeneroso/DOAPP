import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { canjearInvitacion, consultarInvitacion } from '../services/invitacionesInfluencer.js';

const router = express.Router();

/**
 * Invitaciones de creadores de contenido (T&C 7.11). Cada enlace es de un solo uso y, canjeado, exime de comisión a la
 * cuenta durante POLITICAS.INVITACION_DIAS_SIN_COMISION días (ver services/invitacionesInfluencer.ts).
 */

// Cuenta TODO (también lo exitoso): consultar códigos al voleo no puede ser gratis. Los códigos son de 12 caracteres al
// azar, así que adivinar uno no es viable; esto además corta el intento de probarlos de a miles.
const limitadorDeConsultas = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, message: 'Demasiadas consultas. Probá de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/invitaciones/:codigo — ¿sirve este enlace? (público: lo abre quien todavía no tiene cuenta)
 * Sólo cuenta si sirve, de quién es y cuántos días da.
 */
router.get('/:codigo', limitadorDeConsultas, async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await consultarInvitacion(req.params.codigo);
    res.json({ success: true, ...r });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * POST /api/invitaciones/canjear — canjea una invitación para la cuenta que inició sesión.
 * Body: { codigo }
 */
router.post('/canjear', protect, limitadorDeConsultas, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await canjearInvitacion(String(req.user!.id), req.body?.codigo);
    if (r.ok === false) {
      res.status(r.motivo === 'usuario_inexistente' ? 404 : 400).json({ success: false, motivo: r.motivo, message: r.mensaje });
      return;
    }
    res.json({
      success: true,
      message: `Listo: no pagás comisión por tus contratos como Cliente hasta el ${r.hasta.toLocaleDateString('es-AR')}.`,
      hasta: r.hasta,
      dias: r.dias,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

export default router;
