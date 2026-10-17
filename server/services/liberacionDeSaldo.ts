import { QueryTypes } from 'sequelize';
import { PAGO_TRABAJADOR_RETENCION_DIAS } from '../../shared/constants/policies.js';

/**
 * CUÁNDO el saldo de un usuario se puede retirar.
 *
 * El saldo se SUMA en el momento del hecho (se cancela una publicación, se completa un contrato): el usuario ve de inmediato lo que le
 * corresponde. Pero esa plata solo se puede RETIRAR al banco cuando ya existe de verdad en la cuenta de la plataforma, es decir:
 *
 *   - Devoluciones al cliente: desde que Mercado Pago libera el pago original (`money_release_date`, o `PAYMENT_RELEASE_DAYS` desde que se
 *     aprobó si el webhook no trajo la fecha). Si el cliente cancela días después de pagar, esa fecha ya pasó y no espera nada.
 *   - Cobros del trabajador: lo que tarde más entre la liberación de Mercado Pago y el plazo para que el cliente reclame
 *     (`PAGO_TRABAJADOR_RETENCION_DIAS` desde el fin del trabajo). Es la misma regla que ya aplica el pago manual del administrador.
 *
 * Cada crédito lleva su fecha en `metadata.disponibleDesde` (ISO). Retirar toma solo lo que ya está disponible. Usar el saldo dentro de la app
 * (pagar una publicación) no espera: no sale plata de la plataforma.
 */

export interface ContratoParaLiberar {
  completedAt?: Date | null;
  clientConfirmedAt?: Date | null;
  updatedAt?: Date | null;
}

export interface PagoParaLiberar {
  approvedAt?: Date | string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
  moneyReleaseDate?: Date | string | null;
}

const hasta = (v: Date | string | null | undefined): number => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Cuándo libera Mercado Pago la plata de un pago. null si no hay forma de saberlo (sin fecha del webhook y sin `PAYMENT_RELEASE_DAYS`):
 * en ese caso no se inventa una espera.
 */
export function liberaMpEl(pago: PagoParaLiberar | null | undefined): Date | null {
  if (!pago) return null;
  const real = hasta(pago.moneyReleaseDate);
  if (real > 0) return new Date(real);
  const dias = Number(process.env.PAYMENT_RELEASE_DAYS);
  const desde = hasta(pago.approvedAt) || hasta(pago.paidAt) || hasta(pago.createdAt);
  if (desde > 0 && Number.isFinite(dias) && dias > 0) return new Date(desde + dias * 86_400_000);
  return null;
}

/**
 * Desde cuándo se puede transferir el pago de un contrato al trabajador: manda el reloj que termina después, el de Mercado Pago o el del
 * plazo de reclamo del cliente. En un trabajo corto es el de Mercado Pago; en uno largo, el de la retención.
 */
export function pagableDesde(
  contract: ContratoParaLiberar,
  /** Cuándo pagó el cliente, si se conoce: la plata queda «a liberar» en Mercado Pago. */
  pagadoEl?: Date | string | null,
  /** La fecha REAL en que Mercado Pago libera (`money_release_date`). Si viene, manda sobre el cálculo. */
  liberaMpEl_?: Date | string | null,
): Date {
  const fin = contract.completedAt || contract.clientConfirmedAt || contract.updatedAt || new Date();
  const porRetencion = new Date(fin).getTime() + PAGO_TRABAJADOR_RETENCION_DIAS * 86_400_000;
  const diasMp = Number(process.env.PAYMENT_RELEASE_DAYS);
  const porLiberacionMp = liberaMpEl_
    ? new Date(liberaMpEl_).getTime()
    : pagadoEl && Number.isFinite(diasMp) && diasMp > 0
      ? new Date(pagadoEl).getTime() + diasMp * 86_400_000
      : 0;
  return new Date(Math.max(porRetencion, porLiberacionMp));
}

/** La fecha `disponibleDesde` de una devolución al cliente, o undefined si ya está disponible (o no se sabe). */
export function disponibleDesdeDeUnaDevolucion(pago: PagoParaLiberar | null | undefined, ahora = new Date()): string | undefined {
  const d = liberaMpEl(pago);
  return d && d.getTime() > ahora.getTime() ? d.toISOString() : undefined;
}

/** La fecha `disponibleDesde` del cobro de un trabajador, o undefined si ya está disponible. */
export function disponibleDesdeDeUnCobro(
  contrato: ContratoParaLiberar,
  pago: PagoParaLiberar | null | undefined,
  ahora = new Date(),
): string | undefined {
  const d = pagableDesde(contrato, pago?.approvedAt || pago?.paidAt || pago?.createdAt, pago?.moneyReleaseDate);
  return d.getTime() > ahora.getTime() ? d.toISOString() : undefined;
}

export interface SaldoRetirable {
  /** Todo lo que figura en la cuenta. */
  total: number;
  /** Lo que se puede retirar ahora. */
  disponible: number;
  /** Lo que ya está en la cuenta pero todavía no se libera para retirar. */
  enLiberacion: number;
  /** La próxima fecha en que se libera algo, si hay algo en liberación. */
  proximaLiberacion: Date | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cuánto de su saldo puede retirar un usuario ahora. Las entradas todavía no liberadas se descuentan del saldo actual, con un tope: si el
 * usuario ya gastó parte de su saldo dentro de la app, lo gastado sale de lo disponible primero (lo que se puede retirar nunca supera lo que
 * hay, ni queda negativo).
 */
export async function saldoRetirable(userId: string, saldoTotal: number, opciones: { transaction?: unknown; ahora?: Date } = {}): Promise<SaldoRetirable> {
  const { sequelize } = await import('../config/database.js');
  const ahora = opciones.ahora ?? new Date();
  const filas = (await sequelize.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS monto, MIN((metadata->>'disponibleDesde')::timestamptz) AS proxima
       FROM balance_transactions
      WHERE user_id = :userId AND status = 'completed' AND amount > 0
        AND metadata ? 'disponibleDesde' AND (metadata->>'disponibleDesde')::timestamptz > :ahora`,
    { replacements: { userId, ahora }, type: QueryTypes.SELECT, transaction: opciones.transaction as any },
  )) as Array<{ monto: number; proxima: Date | null }>;

  const total = r2(Number(saldoTotal) || 0);
  const enLiberacion = Math.min(total, r2(Number(filas[0]?.monto) || 0));
  return {
    total,
    disponible: r2(Math.max(0, total - enLiberacion)),
    enLiberacion: r2(Math.max(0, enLiberacion)),
    proximaLiberacion: enLiberacion > 0 && filas[0]?.proxima ? new Date(filas[0].proxima) : null,
  };
}


/** `disponibleDesde` de una devolución que viene del pago de publicación de un trabajo (baja de precio, cancelación). */
export async function disponibleDesdeDeLaPublicacion(job: { publicationPaymentId?: string | null }): Promise<string | undefined> {
  if (!job?.publicationPaymentId) return undefined;
  try {
    const { Payment } = await import('../models/sql/Payment.model.js');
    const pago = await Payment.findByPk(job.publicationPaymentId, { attributes: ['approvedAt', 'paidAt', 'createdAt', 'moneyReleaseDate'] });
    return disponibleDesdeDeUnaDevolucion(pago as any);
  } catch {
    return undefined; // sin el dato no se inventa una espera
  }
}

/** `disponibleDesde` de una devolución que viene del pago de un contrato (baja del precio de un contrato). */
export async function disponibleDesdeDelPagoDelContrato(contractId: string): Promise<string | undefined> {
  try {
    const { Payment } = await import('../models/sql/Payment.model.js');
    const pago = await Payment.findOne({ where: { contractId }, attributes: ['approvedAt', 'paidAt', 'createdAt', 'moneyReleaseDate'], order: [['createdAt', 'ASC']] });
    return disponibleDesdeDeUnaDevolucion(pago as any);
  } catch {
    return undefined;
  }
}
