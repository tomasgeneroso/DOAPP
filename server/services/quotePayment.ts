import { Job } from '../models/sql/Job.model.js';
import { calculateCommission } from './commissionService.js';
import { splitFees } from '../../shared/pricing/processingCost.js';

/**
 * Cuanto falta pagar para aceptar una cotizacion.
 *
 * El precio publicado es indicativo: el cliente puede publicar "a cotizar" o
 * poner un monto, y el trabajador responde con el suyo. Recien cuando se acepta
 * una cotizacion se sabe el precio real, y ahi hay que emparejar lo pagado con
 * lo acordado.
 *
 * Tres casos, y ninguno se puede resolver con la misma cuenta:
 *
 *   a cotizar          no se pago nada al publicar: se paga todo ahora.
 *   cotiza mas         se pago por menos: se paga la diferencia.
 *   cotiza menos       se pago de mas: la diferencia queda a favor del cliente.
 *
 * El ultimo caso no se devuelve a la tarjeta a proposito. Un reembolso parcial
 * cuesta una operacion en la pasarela y puede fallar segun el medio de pago;
 * un saldo a favor es inmediato, no falla, y el cliente lo usa en la proxima
 * publicacion. Si quiere la plata de vuelta, la retira como cualquier saldo.
 */

export interface QuoteSettlement {
  /** Lo que ya se pago al publicar, sin comision ni IVA. */
  yaPagado: number;
  /** El precio que se acordo con el trabajador. */
  acordado: number;
  /** Lo que falta cobrarle al cliente para poder contratar. */
  aPagar: number;
  /** Lo que le queda a favor si ya habia pagado de mas. */
  aFavor: number;
  /** Comision e IVA sobre lo que falta pagar. */
  comision: number;
  iva: number;
  /** El total a cobrar: diferencia + comision + IVA. */
  totalACobrar: number;
  /** Lo que va a recibir el trabajador, ya descontada la pasarela. */
  trabajadorRecibe: number;
  /** Si se puede contratar sin pagar nada mas. */
  listoParaContratar: boolean;
}

export async function settleQuote(job: Job, precioCotizado: number): Promise<QuoteSettlement> {
  const acordado = Math.max(0, Number(precioCotizado) || 0);

  // Sólo cuenta como pagado lo que efectivamente se cobró. Un trabajo 'quote'
  // o uno publicado y no pagado todavía valen cero acá, no su precio publicado.
  const yaPagado =
    (job as any).publicationPaid && (job as any).pricingMode === 'fixed'
      ? Number(job.price) || 0
      : 0;

  const diferencia = acordado - yaPagado;

  if (diferencia <= 0) {
    // Cotizó por menos: no se cobra nada y la diferencia queda a favor.
    const s = splitFees(acordado, 0, 0);
    return {
      yaPagado,
      acordado,
      aPagar: 0,
      aFavor: Math.round(-diferencia * 100) / 100,
      comision: 0,
      iva: 0,
      totalACobrar: 0,
      trabajadorRecibe: s.workerReceives,
      listoParaContratar: true,
    };
  }

  // La comisión se calcula sobre la diferencia, no sobre el total: la parte ya
  // pagada ya pagó su comisión al publicarse.
  const c = await calculateCommission((job as any).clientId, diferencia);
  const s = splitFees(diferencia, c.commission, c.vat);

  return {
    yaPagado,
    acordado,
    aPagar: Math.round(diferencia * 100) / 100,
    aFavor: 0,
    comision: c.commission,
    iva: c.vat,
    totalACobrar: s.clientPays,
    // Lo que recibe el trabajador es sobre el precio acordado completo.
    trabajadorRecibe: splitFees(acordado, c.commission, c.vat).workerReceives,
    listoParaContratar: false,
  };
}

/**
 * Acredita saldo a favor de un usuario.
 *
 * Lee el saldo con `FOR UPDATE` y escribe dentro de la misma transaccion. El
 * patron sin bloqueo -- leer el saldo, sumarle, guardarlo -- pierde plata si dos
 * procesos corren a la vez: los dos leen el mismo saldo previo y el segundo
 * pisa al primero. Con un solo acreditamiento por cotizacion es improbable,
 * pero es exactamente el tipo de error que no se detecta hasta que le pasa a
 * alguien y no hay forma de reconstruir cuanto se perdio.
 */
export async function acreditarSaldo(
  userId: string,
  monto: number,
  descripcion: string,
  ref: { relatedModel?: string; relatedId?: string } = {},
): Promise<void> {
  if (!(monto > 0)) return;

  const { sequelize } = await import('../config/database.js');
  const { User } = await import('../models/sql/User.model.js');
  const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;

  await sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new Error(`Usuario ${userId} no encontrado al acreditar saldo`);

    const antes = parseFloat(String((user as any).balanceArs)) || 0;
    const despues = Math.round((antes + monto) * 100) / 100;

    await BalanceTransaction.create(
      {
        userId,
        type: 'refund',
        amount: monto,
        balanceBefore: antes,
        balanceAfter: despues,
        description: descripcion,
        status: 'completed',
        relatedModel: ref.relatedModel,
        relatedId: ref.relatedId,
      } as any,
      { transaction: t },
    );

    (user as any).balanceArs = despues;
    await user.save({ transaction: t });
  });
}

/**
 * Dias habiles entre dos fechas, sin contar feriados.
 *
 * No se contemplan los feriados argentinos a proposito: mantener ese calendario
 * al dia es trabajo permanente, y para pausar una publicacion la diferencia de
 * uno o dos dias no cambia nada. Si alguna vez importa, se agrega acá y el
 * resto del sistema no se entera.
 */
export function diasHabilesDesde(desde: Date, hasta: Date = new Date()): number {
  const a = new Date(desde);
  a.setHours(0, 0, 0, 0);
  const b = new Date(hasta);
  b.setHours(0, 0, 0, 0);
  if (b <= a) return 0;

  let dias = 0;
  const cursor = new Date(a);
  while (cursor < b) {
    cursor.setDate(cursor.getDate() + 1);
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) dias++;
  }
  return dias;
}

/** A los cuantos dias habiles sin cotizacion aceptada se pausa una publicacion. */
export const DIAS_HABILES_ANTES_DE_PAUSAR = 10;
