import { logEvento } from '../utils/auditLog.js';

/**
 * Qué hacer cuando el cliente pide pagar un contrato y ya hay un pago registrado "sin terminar".
 *
 * Antes cualquier pago registrado (aunque sólo estuviera «pending») daba 400 «Payment already exists»: si Mercado Pago
 * fallaba al armar la preferencia, o el cliente cerraba el checkout, el contrato quedaba sin poder pagarse nunca.
 * Pero el dinero manda: un «pending» con una preferencia viva en Mercado Pago PUEDE terminar pagándose, así que no se
 * lo anula ni se crea otro (cobraría dos veces). Se decide así:
 *
 *   - 'huerfano'   : nunca llegó a Mercado Pago (no tiene id de preferencia). Nadie lo puede haber pagado: se anula, con
 *                    nota de quién/cuándo/por qué, y se crea uno nuevo.
 *   - 'reanudable' : tiene preferencia, se guardó su dirección de pago, por el mismo monto que hoy vale el contrato:
 *                    se devuelve la MISMA dirección (el mismo pago; no se crea otro).
 *   - 'bloquea'    : cualquier otro caso (ya cobrado y esperando, en proceso, sin dirección guardada, monto distinto):
 *                    sigue dando 400, como antes.
 */
export type ClasificacionDePagoExistente = 'huerfano' | 'reanudable' | 'bloquea';

export interface PagoExistente {
  status?: string;
  amount?: number | string;
  mercadopagoPreferenceId?: string | null;
  mercadopagoVerifiedAt?: Date | string | null;
  mercadopagoPaymentId?: string | null;
  metadata?: Record<string, any> | null;
}

export function direccionDePagoGuardada(pago: PagoExistente | null | undefined): string | null {
  const url = pago?.metadata?.checkoutUrl;
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}

export function clasificarPagoExistente(
  pago: PagoExistente,
  contrato: { totalPrice?: number | string },
): ClasificacionDePagoExistente {
  // Sólo un «pending» limpio se puede anular o reanudar. Lo demás (en proceso, ya cobrado, verificado…) bloquea.
  if (String(pago.status) !== 'pending') return 'bloquea';
  // Si Mercado Pago ya avisó algo de este pago, es plata en movimiento: no se toca.
  if (pago.mercadopagoVerifiedAt || pago.mercadopagoPaymentId) return 'bloquea';

  if (!pago.mercadopagoPreferenceId) return 'huerfano';

  const mismoMonto = Number(pago.amount) === Number(contrato.totalPrice);
  if (mismoMonto && direccionDePagoGuardada(pago)) return 'reanudable';
  return 'bloquea';
}

/** Anula un pago que nunca llegó a Mercado Pago, dejando anotado quién, cuándo y por qué. */
export async function anularPagoHuerfano(pago: any, motivo: string, actor: string): Promise<void> {
  const anterior = pago.status;
  pago.status = 'cancelled';
  // Objeto nuevo: Sequelize no detecta el cambio si se muta el mismo objeto.
  pago.metadata = {
    ...(pago.metadata || {}),
    anulacion: { por: actor, el: new Date().toISOString(), motivo, estadoAnterior: anterior },
  };
  if (typeof pago.changed === 'function') pago.changed('metadata', true);
  await pago.save();

  await logEvento({
    action: 'CONTRACT_PAYMENT_ORPHAN_CANCELLED',
    actor,
    category: 'payment',
    severity: 'low',
    description: `Se anuló el pago ${pago.id} del contrato ${pago.contractId}: ${motivo}`,
    targetModel: 'Payment',
    targetId: String(pago.id),
    changes: [{ field: 'status', oldValue: anterior, newValue: 'cancelled' }],
    metadata: { contractId: pago.contractId, payerId: pago.payerId, monto: pago.amount, motivo },
  });
}
