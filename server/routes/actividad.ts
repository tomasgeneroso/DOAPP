import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, AuthRequest } from '../middleware/auth.js';
import { PLATAFORMAS, anotarLatido, sumarAlContador, type Plataforma } from '../services/registroDeUso.js';

/**
 * Registro de uso propio (no sale de DOAPP ni usa a terceros):
 *  - POST /api/actividad/latido            (con sesión) «estoy usando DOAPP», una vez por minuto mientras la pantalla está en uso;
 *  - POST /api/actividad/primera-apertura  (sin sesión) la app se abrió por primera vez en un teléfono. Solo suma uno a un contador.
 * Del pedido no se guarda nada más que la plataforma.
 */
const router = express.Router();

const limiteDeAperturas = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Demasiados pedidos.' } });

const plataformaValida = (v: unknown): v is Plataforma => typeof v === 'string' && (PLATAFORMAS as readonly string[]).includes(v);

router.post('/latido', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!plataformaValida(req.body?.plataforma)) {
    res.status(400).json({ success: false, message: 'Plataforma inválida' });
    return;
  }
  try {
    // El equipo no cuenta como comunidad: sus visitas al panel inflarían los índices.
    if (!(req.user as any).adminRole) await anotarLatido(String(req.user.id), req.body.plataforma);
  } catch (e: any) {
    console.error('Registro de uso:', e?.message);
  }
  // Nunca molesta a quien está usando la app: si anotar falla, se contesta igual.
  res.json({ success: true });
});

router.post('/primera-apertura', limiteDeAperturas, async (req: Request, res: Response): Promise<void> => {
  if (!plataformaValida(req.body?.plataforma) || req.body.plataforma === 'web') {
    res.status(400).json({ success: false, message: 'Plataforma inválida' });
    return;
  }
  try {
    await sumarAlContador('app_first_open');
  } catch (e: any) {
    console.error('Primera apertura:', e?.message);
  }
  res.json({ success: true });
});

export default router;
