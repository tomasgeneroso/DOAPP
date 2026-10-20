/**
 * Lo que Mercado Pago le descontó DE VERDAD a DOAPP por un pago, y la comprobación contra lo que se le cobró al cliente por procesamiento.
 *
 * Incidente 2026-10-19: el cliente pagó $5.267,03 por un trabajo de $5.000 (procesamiento calculado con 4,19%), pero Mercado Pago liquidó
 * $4.987,35: su tarifa real era 4,39% + IVA (5,31%). El trabajador cobra los $5.000 del contrato —el pago al trabajador no depende de lo que
 * liquida MP— así que la diferencia la ponía DOAPP en cada operación, y nadie se enteraba: el aviso de «la tarifa no coincide» solo corría en el
 * flujo del webhook (apagado por defecto), y el flujo real (capture-order) ni siquiera guardaba la tarifa ni el neto. Esto lo usan los dos.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CostoRealDeMp {
  /** Lo que MP descontó (tarifa + IVA), si informó `fee_details`. */
  processingFee?: number;
  /** Lo que MP acredita a DOAPP, si informó `transaction_details.net_received_amount`. */
  netReceivedAmount?: number;
  /** Cuándo libera MP esta plata (`money_release_date`). */
  moneyReleaseDate?: Date;
}

/** De la respuesta de `getPayment`, lo que MP descontó y acredita. Sin datos inventados: lo que no vino, no está. */
export function costoRealDeMp(mp: {
  fee_details?: Array<{ amount?: number; fee_payer?: string }>;
  transaction_details?: { net_received_amount?: number };
  money_release_date?: string;
} | null | undefined): CostoRealDeMp {
  const out: CostoRealDeMp = {};
  if (!mp) return out;
  const detalles = Array.isArray(mp.fee_details) ? mp.fee_details : [];
  // Solo lo que paga el vendedor: la parte que paga el comprador (financiación) no es costo de DOAPP.
  const comision = detalles.filter((f) => !f.fee_payer || f.fee_payer === 'collector').reduce((acc, f) => acc + (Number(f.amount) || 0), 0);
  if (comision > 0) out.processingFee = r2(comision);
  const neto = Number(mp.transaction_details?.net_received_amount);
  if (Number.isFinite(neto) && neto > 0) out.netReceivedAmount = r2(neto);
  if (mp.money_release_date) {
    const d = new Date(mp.money_release_date);
    if (!Number.isNaN(d.getTime())) out.moneyReleaseDate = d;
  }
  return out;
}

/** ¿La tarifa real de MP (sin IVA) supera lo cobrado al cliente por procesamiento? Con un peso de tolerancia (los redondeos de MP no son alarma). */
export async function tarifaSuperaLoCobrado(
  tarifaConIva: number,
  cobradoSinIva: number,
): Promise<{ supera: boolean; tarifaSinIva: number; diferencia: number }> {
  const { pasarelaSinIva } = await import('../../shared/pricing/processingCost.js');
  const tarifaSinIva = pasarelaSinIva(tarifaConIva);
  const diferencia = r2(tarifaSinIva - cobradoSinIva);
  return { supera: cobradoSinIva > 0 && tarifaConIva > 0 && tarifaSinIva > cobradoSinIva + 1, tarifaSinIva, diferencia };
}

/**
 * Guarda el costo real en el pago (en la instancia; quien llama la guarda) y, la PRIMERA vez que se conoce, avisa si MP cobró más de lo que se le
 * cobró al cliente. Si capture-order y el webhook procesan el mismo pago, el aviso sale una sola vez.
 */
export async function registrarCostoRealDeMp(payment: any, mp: Parameters<typeof costoRealDeMp>[0]): Promise<CostoRealDeMp> {
  const costo = costoRealDeMp(mp);
  const primeraVez = payment.processingFee === null || payment.processingFee === undefined;
  if (costo.processingFee !== undefined) payment.processingFee = costo.processingFee;
  if (costo.netReceivedAmount !== undefined) payment.netReceivedAmount = costo.netReceivedAmount;
  if (costo.moneyReleaseDate) payment.moneyReleaseDate = costo.moneyReleaseDate;

  if (primeraVez && costo.processingFee !== undefined) {
    try {
      const cobrado = Number(payment.processingCharge) || 0;
      const { supera, tarifaSinIva, diferencia } = await tarifaSuperaLoCobrado(costo.processingFee, cobrado);
      if (supera) {
        const { logMoneyEvent } = await import('../utils/auditLog.js');
        await logMoneyEvent({
          action: 'PROCESSING_FEE_MISMATCH',
          actor: 'system',
          severity: 'high',
          description:
            `Mercado Pago cobró más de lo que se le cobró al cliente por procesamiento: ` +
            `$${tarifaSinIva} contra $${cobrado} (diferencia $${diferencia}). ` +
            `Revisá el plazo de acreditación en el panel de MP y la tasa en /admin/platform.`,
          paymentId: String(payment.id),
          userId: payment.payerId ? String(payment.payerId) : undefined,
          monto: diferencia,
          moneda: 'ARS',
          metadata: { cobradoAlCliente: cobrado, tarifaRealSinIva: tarifaSinIva, tarifaConIva: costo.processingFee, netoQueAcreditaMp: costo.netReceivedAmount ?? null },
        }).catch(() => {});

        const { User } = await import('../models/sql/User.model.js');
        const { Notification } = await import('../models/sql/Notification.model.js');
        const { DONDE_ES_ADMIN } = await import('../utils/admins.js');
        const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN } as any });
        for (const admin of admins) {
          await Notification.create({
            recipientId: admin.id,
            type: 'error',
            category: 'admin',
            title: 'La tarifa de Mercado Pago no coincide',
            message:
              `En este pago MP cobró $${tarifaSinIva} de tarifa (sin IVA) y al cliente se le cobraron $${cobrado}: ` +
              `DOAPP está poniendo $${diferencia} por operación, porque el trabajador cobra el precio entero. ` +
              `Suele ser que la tasa de procesamiento quedó por debajo de la tarifa de MP para el plazo elegido. ` +
              `Ajustala en Panel → Fase de la plataforma.`,
            relatedModel: 'Payment',
            relatedId: payment.id,
            sentVia: ['in_app'],
          } as any).catch(() => {});
        }
      }
    } catch {
      /* la conciliación no puede impedir que se procese el pago */
    }
  }
  return costo;
}
