import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, authorize, AuthRequest } from '../middleware/auth.js';
import { Payment } from '../models/sql/Payment.model.js';
import { PaymentProof } from '../models/sql/PaymentProof.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { logAudit, getSeverityForAction } from '../utils/auditLog.js';
import {
  crearOrden,
  ordenDelContrato,
  ordenCubierta,
  verificarComprobante,
  moduloPagoAlTerminarActivo,
  OrdenInvalida,
  TIPO_ORDEN,
} from '../services/pagoAlTerminar.js';
import { AVISOS_SIN_PROTECCION } from '../../shared/pagos/modoDePago.js';

/**
 * La orden de pago del modo sin protección.
 *
 * Todo lo que pasa acá ocurre DESPUÉS de que el trabajo terminó. Antes de eso
 * no hay nada que cobrar y no hay orden: si la hubiera, sería un pago por
 * adelantado sin la retención que lo hace seguro, que es exactamente lo que
 * este modo no es.
 */
const router = Router();

/** Lo que se le devuelve al navegador sobre una orden. */
function paraMostrar(orden: Payment | null) {
  if (!orden) return null;
  const meta = (orden.metadata as any) || {};
  return {
    id: orden.id,
    estado: orden.status,
    metodo: meta.metodo || null,
    total: Number(orden.amount),
    desglose: meta.desglose || null,
    linkDePago: meta.linkDePago || null,
    vence: orden.expiresAt,
    cubierta: ordenCubierta(orden),
    confirmadaEn: meta.confirmadoEn || null,
    confirmadaPor: meta.confirmadoPor || null,
    motivoDelRechazo: meta.motivoDelRechazo || null,
    comprobantes: ((orden as any).proofs || [])
      .filter((p: any) => p.isActive && p.kind !== 'note')
      .map((p: any) => ({ id: p.id, url: p.fileUrl, estado: p.status, subidoEn: p.uploadedAt })),
  };
}

/**
 * GET /api/payment-orders/contract/:contractId
 * La orden de un contrato, si tiene. Las dos partes pueden verla.
 */
router.get('/contract/:contractId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contrato = await Contract.findByPk(req.params.contractId, {
      attributes: ['id', 'clientId', 'doerId', 'paymentMode', 'status'],
    });
    if (!contrato) {
      res.status(404).json({ success: false, message: 'El contrato no existe.' });
      return;
    }

    const esParte = req.user.id === contrato.clientId || req.user.id === contrato.doerId;
    const esAdmin = ['admin', 'super_admin', 'owner', 'support'].includes(
      (req.user as any).adminRole || req.user.role,
    );
    if (!esParte && !esAdmin) {
      res.status(403).json({ success: false, message: 'No sos parte de este contrato.' });
      return;
    }

    const orden = await ordenDelContrato(contrato.id);

    res.json({
      success: true,
      data: {
        paymentMode: contrato.paymentMode,
        orden: paraMostrar(orden),
        // El aviso viaja con la respuesta para que la pantalla no lo escriba
        // por su cuenta: es el mismo texto que los términos.
        aviso: contrato.paymentMode === 'on_completion' ? AVISOS_SIN_PROTECCION.contratacion : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/payment-orders/contract/:contractId
 * Crear la orden cuando el trabajo terminó. La piden el trabajador o el cliente.
 */
router.post('/contract/:contractId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const metodo = req.body?.metodo === 'comprobante' ? 'comprobante' : 'mercadopago';

    const { orden, desglose, linkDePago } = await crearOrden(
      req.params.contractId,
      metodo,
      req.user.id,
    );

    /**
     * Avisarle a la otra parte. En este modo el aviso no es una cortesía: hasta
     * que alguien pague, el trabajador entregó un trabajo y no tiene nada, y el
     * cliente puede no haberse enterado de que ya puede pagar.
     */
    const contrato = await Contract.findByPk(req.params.contractId, {
      attributes: ['id', 'clientId', 'doerId'],
    });
    const otro = req.user.id === contrato?.clientId ? contrato?.doerId : contrato?.clientId;
    if (otro) {
      await Notification.create({
        recipientId: otro,
        type: 'info',
        category: 'payment',
        title: 'Orden de pago generada',
        message:
          `El trabajo terminó y hay una orden de pago por $${desglose.total.toLocaleString('es-AR')}. ` +
          'Mientras no se pague por esta orden, DOAPP no puede intervenir en un reclamo.',
        relatedModel: 'Contract',
        relatedId: req.params.contractId,
        sentVia: ['in_app'],
      } as any).catch(() => {
        /* que falle la notificación no puede deshacer la orden */
      });
    }

    res.json({ success: true, data: { orden: paraMostrar(orden), desglose, linkDePago } });
  } catch (error: any) {
    const invalida = error instanceof OrdenInvalida;
    res.status(invalida ? 409 : 500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------

/**
 * GET /api/payment-orders/admin/pendientes
 * Órdenes con comprobante esperando que alguien las mire.
 */
router.get(
  '/admin/pendientes',
  protect,
  authorize('admin', 'super_admin', 'owner', 'support'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const ordenes = await Payment.findAll({
        where: {
          paymentType: TIPO_ORDEN,
          status: { [Op.in]: ['pending_verification', 'pending'] },
        },
        include: [
          { model: PaymentProof, as: 'proofs', required: false },
          { model: User, as: 'payer', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'recipient', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'ASC']],
        limit: 200,
      });

      res.json({
        success: true,
        data: ordenes.map((o) => ({
          ...paraMostrar(o),
          contractId: o.contractId,
          cliente: (o as any).payer?.name || null,
          trabajador: (o as any).recipient?.name || null,
          creada: o.createdAt,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

/**
 * POST /api/payment-orders/:id/verificar
 * Un admin da por buena —o rechaza— la transferencia de un comprobante.
 */
router.post(
  '/:id/verificar',
  protect,
  authorize('admin', 'super_admin', 'owner'),
  async (req: AuthRequest, res: Response) => {
    const { decision, motivo } = req.body || {};
    try {
      if (decision !== 'aprobar' && decision !== 'rechazar') {
        res.status(400).json({ success: false, message: 'La decisión es "aprobar" o "rechazar".' });
        return;
      }
      if (decision === 'rechazar' && !String(motivo || '').trim()) {
        // Un rechazo sin motivo deja al cliente sin saber qué corregir, y al
        // que lo revise después sin saber por qué se rechazó.
        res.status(400).json({ success: false, message: 'Un rechazo necesita un motivo.' });
        return;
      }

      const orden = await verificarComprobante(req.params.id, req.user.id, decision, motivo);

      await logAudit({
        req,
        action: decision === 'aprobar' ? 'payment_order_verified' : 'payment_order_rejected',
        category: 'payment',
        severity: getSeverityForAction(
          decision === 'aprobar' ? 'payment_order_verified' : 'payment_order_rejected',
        ),
        description:
          decision === 'aprobar'
            ? `Comprobante aprobado en la orden ${orden.id.slice(0, 8)}`
            : `Comprobante rechazado en la orden ${orden.id.slice(0, 8)}: ${motivo}`,
        targetModel: 'Payment',
        targetId: orden.id,
      });

      // Las dos partes se enteran: para el trabajador es la diferencia entre
      // cobrar y no cobrar, y para el cliente entre estar cubierto y no estarlo.
      for (const quien of [orden.payerId, orden.recipientId].filter(Boolean) as string[]) {
        await Notification.create({
          recipientId: quien,
          type: decision === 'aprobar' ? 'success' : 'warning',
          category: 'payment',
          title: decision === 'aprobar' ? 'Pago confirmado' : 'Comprobante rechazado',
          message:
            decision === 'aprobar'
              ? 'El comprobante fue verificado. La operación queda cubierta por DOAPP.'
              : `El comprobante no se pudo verificar: ${motivo}`,
          relatedModel: 'Contract',
          relatedId: orden.contractId || null,
          sentVia: ['in_app'],
        } as any).catch(() => {});
      }

      res.json({ success: true, data: paraMostrar(orden) });
    } catch (error: any) {
      const invalida = error instanceof OrdenInvalida;
      res.status(invalida ? 409 : 500).json({ success: false, message: error.message });
    }
  },
);

/**
 * GET /api/payment-orders/estado-del-modulo
 * Si el pago al terminar está disponible. Lo consultan los formularios.
 */
router.get('/estado-del-modulo', async (_req, res: Response) => {
  try {
    res.json({ success: true, data: { activo: await moduloPagoAlTerminarActivo() } });
  } catch {
    // Ante la duda, apagado: es el modo en que nadie asume un riesgo que no eligió.
    res.json({ success: true, data: { activo: false } });
  }
});

export default router;
