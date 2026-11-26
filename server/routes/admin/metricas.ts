import express, { Response } from 'express';
import { protect, AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/permissions.js';
import { metricasDeProducto } from '../../services/metricasDeProducto.js';

/** Índices de producto: solo totales, solo para el dueño y marketing. */
const router = express.Router();

router.use(protect);
router.use(requireRole('owner', 'marketing'));

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await metricasDeProducto() });
  } catch (error: any) {
    console.error('Métricas de producto:', error?.message);
    res.status(500).json({ success: false, message: 'No pudimos calcular los índices. Probá de nuevo en un rato.' });
  }
});

export default router;
