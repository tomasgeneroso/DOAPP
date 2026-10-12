import express, { Response } from 'express';
import { protect, requireAdminRole } from '../../middleware/auth.js';
import type { AuthRequest } from '../../types/index.js';
import { POLITICAS } from '../../../shared/constants/policies.js';
import {
  crearLoteDeInvitaciones,
  darDeBajaInvitacion,
  listarLotes,
  MAXIMO_DE_INVITACIONES_POR_LOTE,
} from '../../services/invitacionesInfluencer.js';

const router = express.Router();

// Sólo el owner emite y da de baja invitaciones: son comisión que se deja de cobrar.
const ownerOnly = requireAdminRole('owner');

/**
 * GET /api/admin/influencer-invites — los lotes (uno por creador) con el estado de cada enlace y quién lo canjeó.
 */
router.get('/', protect, ownerOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await listarLotes(),
      politica: { invitacionesPorCreador: POLITICAS.INVITACIONES_POR_INFLUENCER, diasSinComision: POLITICAS.INVITACION_DIAS_SIN_COMISION },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * POST /api/admin/influencer-invites — da de alta a un creador y emite su lote (5 por defecto).
 * Body: { nombre, usuario?, cantidad?, notas?, venceEl? }
 */
router.post('/', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, usuario, cantidad, notas, venceEl } = req.body || {};
    let vence: Date | null = null;
    if (venceEl) {
      vence = new Date(venceEl);
      if (Number.isNaN(vence.getTime()) || vence.getTime() <= Date.now()) {
        res.status(400).json({ success: false, message: 'La fecha límite para canjear tiene que ser futura' });
        return;
      }
    }
    const lote = await crearLoteDeInvitaciones({
      nombre,
      usuario,
      cantidad: cantidad === undefined || cantidad === null || cantidad === '' ? undefined : Number(cantidad),
      creadoPorId: String(req.user!.id),
      notas,
      venceEl: vence,
    });
    res.status(201).json({ success: true, message: `Se emitieron ${lote.invitaciones.length} invitaciones`, data: lote, maximo: MAXIMO_DE_INVITACIONES_POR_LOTE });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'No se pudo emitir el lote' });
  }
});

/**
 * POST /api/admin/influencer-invites/:id/deactivate — da de baja una invitación que todavía no se canjeó.
 * Body: { motivo } (al menos 5 caracteres; queda anotado)
 */
router.post('/:id/deactivate', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await darDeBajaInvitacion(req.params.id, req.body?.motivo, String(req.user!.id));
    res.status(r.ok ? 200 : 400).json({ success: r.ok, message: r.mensaje });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

export default router;
