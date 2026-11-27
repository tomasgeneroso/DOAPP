import express, { Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { avisosAlDuenoActivos } from '../services/avisosAlDuenoActivos.js';
import { esReportable } from '../../shared/salud/componentes.js';

/**
 * Lo que falla en el navegador (mapas, direcciones, fotos, avisos en vivo, una pantalla rota) el servidor no lo ve: la web lo cuenta acá. Es pública
 * (los mapas los ve cualquiera), así que solo acepta el NOMBRE de la parte, de una lista fija: ni texto, ni direcciones, ni nada de la persona. No guarda nada.
 */
const router = express.Router();

// La conexión se usa solo para contar cuántas DISTINTAS reportan: un resumen con una sal que cambia en cada arranque, en memoria.
const SAL = crypto.randomBytes(16).toString('hex');

const tope = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Demasiados pedidos.' } });

router.post('/falla', tope, (req: Request, res: Response): void => {
  const componente = req.body?.componente;
  if (!esReportable(componente)) {
    res.status(400).json({ success: false, message: 'Componente desconocido.' });
    return;
  }
  if (avisosAlDuenoActivos()) {
    const origen = crypto.createHash('sha256').update(`${SAL}|${req.ip || ''}`).digest('hex').slice(0, 24);
    void import('../services/saludDeComponentes.js').then((m) => m.reportarDesdeElNavegador(componente, origen)).catch(() => undefined);
  }
  res.status(202).json({ success: true });
});

export default router;
