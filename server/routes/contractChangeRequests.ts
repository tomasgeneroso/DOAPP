import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { ContractChangeRequest } from '../models/sql/ContractChangeRequest.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { protect, authorize } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import {
  INCLUIR_CONTRATO,
  INCLUIR_PERSONAS,
  crearSolicitud,
  escalarSolicitudesVencidas,
  responderSolicitud,
  serializarSolicitud,
} from '../services/solicitudesDeCambio.js';

/**
 * Solicitudes de cambio o cancelación de un contrato. La lógica (y el porqué de cada regla) está en
 * `services/solicitudesDeCambio.ts`; acá solo se valida la forma del pedido y se contesta.
 */
const router = express.Router();

/**
 * POST /api/contract-change-requests
 * Crear una solicitud de cancelación o de modificación (fechas y nota; el precio no se cambia por acá).
 */
router.post(
  '/',
  protect,
  [
    body('contractId').notEmpty().withMessage('El ID del contrato es requerido'),
    body('type').isIn(['cancel', 'modify']).withMessage('Tipo inválido'),
    body('reason').notEmpty().withMessage('La razón es requerida'),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
        return;
      }

      const r = await crearSolicitud({
        contractId: String(req.body.contractId),
        userId: String(req.user.id),
        type: req.body.type,
        reason: req.body.reason,
        newTerms: req.body.newTerms,
      });
      if (r.ok === false) {
        res.status(r.status).json({ success: false, message: r.mensaje });
        return;
      }

      res.status(201).json({ success: true, message: 'Solicitud enviada exitosamente', changeRequest: serializarSolicitud(r.solicitud) });
    } catch (error: any) {
      console.error('Error creating contract change request:', error);
      res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
    }
  },
);

/**
 * GET /api/contract-change-requests/contract/:contractId
 * Las solicitudes de un contrato (solo para sus dos partes).
 */
router.get('/contract/:contractId', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = String(req.user.id);

    const contract: any = await Contract.findByPk(contractId);
    if (!contract) {
      res.status(404).json({ success: false, message: 'Contrato no encontrado' });
      return;
    }
    if (String(contract.clientId) !== userId && String(contract.doerId) !== userId) {
      res.status(403).json({ success: false, message: 'No tenés permiso para ver estas solicitudes' });
      return;
    }

    const changeRequests = await ContractChangeRequest.findAll({
      where: { contractId },
      include: INCLUIR_PERSONAS as any,
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, changeRequests: changeRequests.map(serializarSolicitud) });
  } catch (error: any) {
    console.error('Error fetching contract change requests:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * GET /api/contract-change-requests/:id
 * Una solicitud, con el contrato y las dos personas (solo para las partes del contrato).
 */
router.get('/:id', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const changeRequest: any = await ContractChangeRequest.findByPk(req.params.id, {
      include: [...(INCLUIR_PERSONAS as any[]), INCLUIR_CONTRATO as any],
    });
    if (!changeRequest) {
      res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
      return;
    }

    const contract = changeRequest.contract;
    const userId = String(req.user.id);
    if (!contract || (String(contract.clientId) !== userId && String(contract.doerId) !== userId)) {
      res.status(403).json({ success: false, message: 'No tenés permiso para ver esta solicitud' });
      return;
    }

    res.json({ success: true, changeRequest: serializarSolicitud(changeRequest) });
  } catch (error: any) {
    console.error('Error fetching contract change request:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * PUT /api/contract-change-requests/:id/respond
 * Aceptar o rechazar. Aceptar una cancelación NO cancela el contrato: abre la cancelación oficial de mutuo acuerdo,
 * que resuelve un administrador (es quien decide el dinero). Aceptar una modificación aplica las fechas y la nota.
 */
router.put(
  '/:id/respond',
  protect,
  [body('accept').isBoolean().withMessage('La respuesta debe ser verdadero o falso')],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
        return;
      }

      const r = await responderSolicitud({ id: req.params.id, userId: String(req.user.id), accept: req.body.accept === true || req.body.accept === 'true' });
      if (r.ok === false) {
        res.status(r.status).json({ success: false, message: r.mensaje });
        return;
      }

      const aceptada = r.solicitud.status === 'accepted';
      const message = !aceptada
        ? 'Solicitud rechazada'
        : r.cancelacionOficialId
          ? 'Solicitud aceptada. Se abrió una cancelación de mutuo acuerdo: un administrador la revisa y resuelve el dinero.'
          : 'Solicitud aceptada';
      res.json({
        success: true,
        message,
        changeRequest: serializarSolicitud(r.solicitud),
        cancellationRequestId: r.cancelacionOficialId ?? null,
        appliedChanges: r.cambiosAplicados ?? null,
      });
    } catch (error: any) {
      console.error('Error responding to contract change request:', error);
      res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
    }
  },
);

/**
 * POST /api/contract-change-requests/escalate-expired
 * Pasa a soporte las solicitudes sin respuesta (48 h). Solo administración: era una ruta SIN sesión que crea tickets
 * y manda correos, así que cualquiera la disparaba. El cron la corre por su cuenta (jobs/escalateExpiredChangeRequests.ts).
 */
router.post('/escalate-expired', protect, authorize('owner', 'super_admin', 'admin'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await escalarSolicitudesVencidas();
    res.json({ success: true, message: `Escaladas ${r.escaladas} solicitudes vencidas`, count: r.escaladas, failed: r.fallidas });
  } catch (error: any) {
    console.error('Error escalating expired requests:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

export default router;
