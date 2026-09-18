import { Dispute } from '../models/sql/Dispute.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { logger } from './logger.js';

export type TipoResolucion = 'full_release' | 'full_refund' | 'partial_refund' | 'no_action';

export interface ResolucionParams {
  disputeId: string;
  tipo: TipoResolucion;
  /** Texto que ven las dos partes. */
  resolucion: string;
  /** Solo para partial_refund: cuanto vuelve al cliente. */
  montoDevolucion?: number;
  /** 'admin:<id>' o 'system:silencio'. */
  actor: string;
  /** Id del admin que resolvio, si fue una persona. */
  resueltoPor?: string | null;
}

/**
 * Resuelve una disputa y mueve la plata segun el resultado.
 *
 * Vive como servicio y no dentro de la ruta de admin porque tiene dos puntos
 * de entrada: el administrador que decide, y el sistema cuando una parte deja
 * de responder. Duplicar el movimiento de plata en el cron seria la peor
 * decision posible -- dos copias divergen sin que nadie se entere, y esta es
 * la parte que reparte el dinero de un contrato en conflicto.
 *
 * Las devoluciones pasan por executeFinancialAction. La ruta original llamaba
 * al proveedor directo, y eso saltaba dos cosas: la exclusion mutua (no
 * devolver despues de haber pagado, ni pagar despues de haber devuelto) y el
 * acumulado de refunded_amount que impide devolver dos veces. Una disputa es
 * exactamente el momento en que esas dos protecciones mas hacen falta.
 */
export async function resolverDisputa(p: ResolucionParams): Promise<{ ok: boolean; motivo?: string }> {
  const dispute = await Dispute.findByPk(p.disputeId);
  if (!dispute) return { ok: false, motivo: 'disputa inexistente' };

  if (String(dispute.status).startsWith('resolved') || dispute.status === 'cancelled') {
    return { ok: false, motivo: `la disputa ya esta ${dispute.status}` };
  }

  const contract = await Contract.findByPk(dispute.contractId);
  if (!contract) return { ok: false, motivo: 'contrato inexistente' };

  const payment = (dispute as any).paymentId
    ? await Payment.findByPk((dispute as any).paymentId)
    : await Payment.findOne({ where: { contractId: contract.id } });

  const total = Number(payment?.amount) || 0;
  let estadoDisputa: string;
  let devuelto = 0;

  switch (p.tipo) {
    case 'full_release': {
      await contract.update({
        status: 'completed',
        paymentStatus: 'released',
        escrowStatus: 'released',
        disputeStatus: 'resolved',
        clientConfirmed: true,
        doerConfirmed: true,
      } as any);
      if (payment) {
        await payment.update({ status: 'completed', escrowReleasedAt: new Date() } as any);
      }
      estadoDisputa = 'resolved_released';
      break;
    }

    case 'full_refund':
    case 'partial_refund': {
      // Cuanto vuelve. En full_refund se devuelve el PRECIO del trabajo: la
      // comision de la plataforma no se reembolsa (termino 7.5) y su IVA viaja
      // con ella. Antes se hacia total - comision, que devolvia el IVA de una
      // comision que se retenia. En partial_refund es lo que decidio quien
      // resolvio. El reembolso sale por MP al medio de pago original; MP
      // devuelve su tarifa en proporcion, asi que la pasarela no se descuenta.
      const yaDevuelto = Number((payment as any)?.refundedAmount) || 0;
      const disponible = Math.round((total - yaDevuelto) * 100) / 100;

      const precioContrato = Number((contract as any).allocatedAmount || (contract as any).price) || 0;
      const objetivo =
        p.tipo === 'full_refund'
          ? Math.round(Math.max(0, Math.min(precioContrato || total, total)) * 100) / 100
          : Math.round((Number(p.montoDevolucion) || 0) * 100) / 100;

      devuelto = Math.min(objetivo, disponible);

      if (devuelto <= 0) {
        return { ok: false, motivo: 'no queda nada por devolver en este pago' };
      }

      if (payment?.mercadopagoPaymentId) {
        const { executeFinancialAction } = await import('./paymentActions.js');
        const mercadoPagoService = (await import('./mercadopago.js')).default;

        const r = await executeFinancialAction(
          {
            contractId: String(contract.id),
            paymentId: String(payment.id),
            provider: 'mercadopago',
            actionType: devuelto >= total - 0.01 ? 'REFUND_TOTAL' : 'REFUND_PARTIAL',
            amount: devuelto,
            currency: String(payment.currency || 'ARS'),
            executedById: p.resueltoPor ?? null,
            requestPayload: { disputeId: dispute.id, tipo: p.tipo, actor: p.actor },
          },
          async () => {
            try {
              const res = await mercadoPagoService.refundPayment(
                payment.mercadopagoPaymentId!,
                'mercadopago',
                // Total solo si no hubo devolucion previa y se devuelve todo el
                // pago; si no, parcial con monto explicito. MercadoPago no
                // documenta que hace una total sobre un pago con parcial encima.
                yaDevuelto <= 0.01 && devuelto >= total - 0.01 ? undefined : devuelto,
              );
              return { ok: true, resourceId: res.refundId };
            } catch (e: any) {
              return { ok: false, error: e.message };
            }
          },
        );

        if (!r.ok) {
          return { ok: false, motivo: r.message || 'no se pudo procesar la devolucion' };
        }

        const acumulado = Math.round((yaDevuelto + devuelto) * 100) / 100;
        await payment.update({
          refundedAmount: acumulado,
          refundedAt: new Date(),
          refundedBy: p.resueltoPor ?? null,
          // La disputa cierra el pago aunque quede un resto: lo que no volvio
          // al cliente es del trabajador o de la plataforma, y no se va a
          // devolver despues.
          status: 'refunded',
        } as any);
      }

      const esTotal = p.tipo === 'full_refund';
      await contract.update({
        status: esTotal ? 'cancelled' : 'completed',
        paymentStatus: esTotal ? 'refunded' : 'partially_refunded',
        escrowStatus: esTotal ? 'refunded' : 'released',
        disputeStatus: 'resolved',
      } as any);

      estadoDisputa = esTotal ? 'resolved_refunded' : 'resolved_partial';
      break;
    }

    case 'no_action': {
      await contract.update({ disputeStatus: 'resolved' } as any);
      estadoDisputa = 'resolved_released';
      break;
    }
  }

  const logs = [...((dispute as any).logs || [])];
  logs.push({
    action: 'Disputa resuelta',
    performedBy: p.resueltoPor ?? null,
    actor: p.actor,
    timestamp: new Date(),
    details: `Tipo: ${p.tipo}${devuelto ? ` · devuelto $${devuelto}` : ''}`,
  });

  await dispute.update({
    status: estadoDisputa,
    resolution: p.resolucion,
    resolutionType: p.tipo,
    resolvedAt: new Date(),
    resolvedBy: p.resueltoPor ?? null,
    refundAmount: devuelto || null,
    platformFeeRefunded: false,
    logs,
  } as any);

  await logMoneyEvent({
    action: 'DISPUTE_RESOLVED',
    actor: p.actor,
    severity: 'critical',
    description: `Disputa resuelta como ${p.tipo}. ${p.resolucion}`,
    contractId: String(contract.id),
    disputeId: String(dispute.id),
    paymentId: payment ? String(payment.id) : undefined,
    monto: devuelto || total,
    cuentas: {
      clienteId: (contract as any).clientId,
      trabajadorId: (contract as any).doerId,
      idPagoMercadoPago: payment?.mercadopagoPaymentId,
    },
    metadata: { tipo: p.tipo, devuelto, total, resueltoPor: p.resueltoPor ?? null },
  });

  for (const destinatario of [(contract as any).clientId, (contract as any).doerId]) {
    await Notification.create({
      recipientId: destinatario,
      type: 'info',
      category: 'disputes',
      title: 'Disputa resuelta',
      message: p.resolucion,
      relatedModel: 'Dispute',
      relatedId: dispute.id,
      sentVia: ['in_app'],
    } as any);
  }

  logger.info('disputes', `Disputa ${dispute.id} resuelta (${p.tipo}) por ${p.actor}`);
  return { ok: true };
}
