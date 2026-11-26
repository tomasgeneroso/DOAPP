import express, { Response } from 'express';
import { protect, AuthRequest } from '../middleware/auth.js';
import { marcarVisto, momentosPendientes, personasQueOfrecen, resumenAnual } from '../services/momentos.js';
import { estadoDeAntesYDespues, proponer, responder, retirar, type Resultado } from '../services/antesYDespues.js';
import { cambioVigente } from '../../shared/legal/cambiosDePoliticas.js';
import { esClaveQueSePuedeMarcar } from '../../shared/momentos/momentos.js';
import { esRubroValido } from '../../shared/perfiles/zonaDeTrabajo.js';
import { isValidUUID } from '../utils/sanitizer.js';

/** Momentos importantes: carteles y tarjetas de una vez, resumen anual, cuántas personas ofrecen un rubro y el antes y después. Todo con sesión. */
const router = express.Router();
router.use(protect);

const responderCon = (res: Response, r: Resultado<any>): void => {
  if (r.ok === true) res.json({ success: true, data: r.dato ?? null });
  else res.status((r as { status: number }).status).json({ success: false, message: (r as { message: string }).message });
};

const manejar = (nombre: string, fn: (req: AuthRequest, res: Response) => Promise<void>) => async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await fn(req, res);
  } catch (error: any) {
    console.error(`Momentos, ${nombre}:`, error?.message);
    res.status(500).json({ success: false, message: 'No pudimos completar eso. Probá de nuevo en un rato.' });
  }
};

const idValido = (req: AuthRequest, res: Response): string | null => {
  const id = String(req.params.id || '');
  if (!isValidUUID(id)) {
    res.status(404).json({ success: false, message: 'No encontrado' });
    return null;
  }
  return id;
};

router.get('/', manejar('pendientes', async (req, res) => {
  res.json({ success: true, data: await momentosPendientes(String(req.user.id)) });
}));

router.post('/visto', manejar('visto', async (req, res) => {
  const clave = req.body?.clave;
  // Un cambio de política que todavía no existe no se puede marcar por adelantado.
  const version = typeof clave === 'string' ? Number(clave.match(/^politicas:(\d+)$/)?.[1] || 0) : 0;
  if (!esClaveQueSePuedeMarcar(clave) || version > cambioVigente().version) {
    res.status(400).json({ success: false, message: 'Clave inválida' });
    return;
  }
  await marcarVisto(String(req.user.id), clave);
  res.json({ success: true });
}));

router.get('/resumen-anual', manejar('resumen', async (req, res) => {
  res.json({ success: true, data: await resumenAnual(String(req.user.id)) });
}));

router.get('/oferta', manejar('oferta', async (req, res) => {
  const rubro = String(req.query.rubro || '');
  if (!esRubroValido(rubro)) {
    res.status(400).json({ success: false, message: 'Rubro inválido' });
    return;
  }
  res.json({ success: true, data: { personas: await personasQueOfrecen(rubro) } });
}));

router.get('/antes-despues/contrato/:id', manejar('estado', async (req, res) => {
  const id = idValido(req, res);
  if (id) responderCon(res, await estadoDeAntesYDespues(id, String(req.user.id)));
}));

router.post('/antes-despues/contrato/:id', manejar('proponer', async (req, res) => {
  const id = idValido(req, res);
  if (id) responderCon(res, await proponer(id, String(req.user.id), req.body || {}));
}));

router.post('/antes-despues/:id/aceptar', manejar('aceptar', async (req, res) => {
  const id = idValido(req, res);
  if (id) responderCon(res, await responder(id, String(req.user.id), true));
}));

router.post('/antes-despues/:id/rechazar', manejar('rechazar', async (req, res) => {
  const id = idValido(req, res);
  if (id) responderCon(res, await responder(id, String(req.user.id), false));
}));

router.post('/antes-despues/:id/retirar', manejar('retirar', async (req, res) => {
  const id = idValido(req, res);
  if (id) responderCon(res, await retirar(id, String(req.user.id)));
}));

export default router;
