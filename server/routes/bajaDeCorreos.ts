import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { estaDeBaja, fijarBajaDeCorreos, userIdDelToken } from '../services/bajaDeCorreos.js';

/**
 * Baja de los correos del módulo de correos (2026-11-11). Pública y sin sesión: el TOKEN del enlace del pie del correo es la prueba (`services/bajaDeCorreos.ts`).
 *
 *  - GET  /api/correos/baja/:token   → si la persona está de baja o no (lo lee la página `/baja-de-correos/:token` de la web);
 *  - POST /api/correos/baja/:token   → se da de baja. También es lo que llama el cliente de correo con la cabecera `List-Unsubscribe` (baja con un toque, RFC 8058);
 *  - POST /api/correos/alta/:token   → vuelve a recibirlos (por si se dio de baja sin querer).
 * Un enlace roto o cambiado responde 404 sin decir si la persona existe.
 */
const router = express.Router();

const limitador = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Demasiados intentos. Probá en un rato.' } });
router.use(limitador);

async function conPersona(req: Request, res: Response, accion: (userId: string) => Promise<void>): Promise<void> {
  try {
    const userId = userIdDelToken(String(req.params.token ?? ''));
    if (!userId) {
      res.status(404).json({ success: false, message: 'Este enlace no es válido. Si querés dejar de recibir correos, escribinos desde el Centro de ayuda.' });
      return;
    }
    await accion(userId);
  } catch (e) {
    console.error('[baja de correos]', (e as Error)?.message);
    res.status(500).json({ success: false, message: 'No pudimos completar la acción. Probá de nuevo.' });
  }
}

router.get('/baja/:token', (req: Request, res: Response) =>
  conPersona(req, res, async (userId) => {
    const deBaja = await estaDeBaja(userId);
    if (deBaja === null) {
      res.status(404).json({ success: false, message: 'Este enlace no es válido.' });
      return;
    }
    res.json({ success: true, data: { deBaja } });
  }),
);

router.post('/baja/:token', (req: Request, res: Response) =>
  conPersona(req, res, async (userId) => {
    if (!(await fijarBajaDeCorreos(userId, true))) {
      res.status(404).json({ success: false, message: 'Este enlace no es válido.' });
      return;
    }
    res.json({ success: true, message: 'Listo: no vas a recibir más correos como este. Los avisos de tus pagos, contratos y de seguridad de la cuenta siguen llegando.', data: { deBaja: true } });
  }),
);

router.post('/alta/:token', (req: Request, res: Response) =>
  conPersona(req, res, async (userId) => {
    if (!(await fijarBajaDeCorreos(userId, false))) {
      res.status(404).json({ success: false, message: 'Este enlace no es válido.' });
      return;
    }
    res.json({ success: true, message: 'Listo: vas a volver a recibir estos correos.', data: { deBaja: false } });
  }),
);

export default router;
