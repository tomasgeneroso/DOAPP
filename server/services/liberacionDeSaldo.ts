import { QueryTypes } from 'sequelize';
import { PAGO_TRABAJADOR_RETENCION_DIAS, POLITICAS } from '../../shared/constants/policies.js';
import { etiquetaDelAFavor, type AFavorPendienteItem, type CobroPendiente, type ReferenciaDelCobro } from '../../shared/pagos/aFavorPendiente.js';

export type { AFavorPendienteItem, CobroPendiente };

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
 *
 * Las devoluciones al CLIENTE son la excepción: si el pago original TODAVÍA está en Mercado Pago no hay plata en la cuenta de la plataforma que
 * respalde ese saldo, así que no se suma. Queda «a favor pendiente» (un asiento `pending`, ver `acreditarDevolucion`) y pasa a saldo cuando
 * Mercado Pago libera el pago (`liquidarSaldoPendiente`). Regla del dueño: si el dinero no está en la cuenta de DOAPP, el cliente tampoco lo usa.
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
  /** Cómo se pagó. Una transferencia confirmada a mano o un pago con saldo no pasan por Mercado Pago: no hay nada que esperar. */
  paymentMethod?: string | null;
}

/** Medios de pago cuya plata ya está en la cuenta de la plataforma (o nunca salió de ella) en cuanto se confirman. */
const SIN_ESPERA_DE_MP = ['bank_transfer', 'balance'];

/** Lo que tarda Mercado Pago en liberar un pago cuando no informó la fecha. `PAYMENT_RELEASE_DAYS` lo cambia; `0` apaga la espera. */
export const DIAS_DE_LIBERACION_MP_POR_DEFECTO = POLITICAS.DIAS_LIBERACION_PAGO;

export function diasDeLiberacionMp(): number {
  const crudo = process.env.PAYMENT_RELEASE_DAYS;
  if (crudo === undefined || crudo.trim() === '') return DIAS_DE_LIBERACION_MP_POR_DEFECTO;
  const n = Number(crudo);
  return Number.isFinite(n) && n >= 0 ? n : DIAS_DE_LIBERACION_MP_POR_DEFECTO;
}

/** De la respuesta de Mercado Pago, los datos que se guardan en el pago para saber cuándo se libera su plata. */
export function datosDeLiberacionDeMp(mp: { money_release_date?: string; date_approved?: string } | null | undefined): { moneyReleaseDate?: Date; approvedAt?: Date } {
  const fecha = (v?: string) => {
    const d = v ? new Date(v) : null;
    return d && Number.isFinite(d.getTime()) ? d : undefined;
  };
  const out: { moneyReleaseDate?: Date; approvedAt?: Date } = {};
  const libera = fecha(mp?.money_release_date);
  if (libera) out.moneyReleaseDate = libera;
  out.approvedAt = fecha(mp?.date_approved) ?? new Date();
  return out;
}

const hasta = (v: Date | string | null | undefined): number => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Cuándo libera Mercado Pago la plata de un pago: la fecha real si se guardó; si no, `PAYMENT_RELEASE_DAYS` (10 por defecto) desde la
 * aprobación. null solo si no hay fecha del pago o la espera está apagada (`PAYMENT_RELEASE_DAYS=0`).
 */
export function liberaMpEl(pago: PagoParaLiberar | null | undefined): Date | null {
  if (!pago) return null;
  // Una fecha de liberación anotada manda: un pago con saldo que se pagó con plata todavía retenida (lo pendiente de la misma publicación) la hereda.
  const real = hasta(pago.moneyReleaseDate);
  if (real > 0) return new Date(real);
  // Una transferencia que un administrador confirmó (la plata ya está en el banco) o una publicación pagada con saldo no esperan a Mercado Pago.
  if (pago.paymentMethod && SIN_ESPERA_DE_MP.includes(String(pago.paymentMethod))) return null;
  const dias = diasDeLiberacionMp();
  const desde = hasta(pago.approvedAt) || hasta(pago.paidAt) || hasta(pago.createdAt);
  if (desde > 0 && dias > 0) return new Date(desde + dias * 86_400_000);
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
  const diasMp = diasDeLiberacionMp();
  const porLiberacionMp = liberaMpEl_
    ? new Date(liberaMpEl_).getTime()
    : pagadoEl && diasMp > 0
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


export interface SaldoPendienteDeLiquidar {
  /** Plata que el cliente va a tener a favor, pero que todavía no es suya porque Mercado Pago no liberó el pago original. NO está en su saldo. */
  monto: number;
  /** La próxima fecha en que algo de eso pasa a ser saldo. */
  proximaLiquidacion: Date | null;
}

/**
 * Lo que un usuario tiene a favor PENDIENTE de liquidar: asientos «pending» marcados con `pendienteDeLiquidacion` (ver `acreditarSaldoPendiente`). No
 * suma a su saldo, no se puede usar ni retirar; pasa a saldo cuando llega su `disponibleDesde`.
 */
export async function saldoPendienteDeLiquidar(userId: string): Promise<SaldoPendienteDeLiquidar> {
  const { sequelize } = await import('../config/database.js');
  const filas = (await sequelize.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS monto, MIN((metadata->>'disponibleDesde')::timestamptz) AS proxima
       FROM balance_transactions
      WHERE user_id = :userId AND status = 'pending' AND amount > 0 AND metadata->>'pendienteDeLiquidacion' = 'true'`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  )) as Array<{ monto: number; proxima: Date | null }>;
  const monto = r2(Number(filas[0]?.monto) || 0);
  return { monto, proximaLiquidacion: monto > 0 && filas[0]?.proxima ? new Date(filas[0].proxima) : null };
}

const motivoDelAFavor = (m: Record<string, any> | null | undefined): AFavorPendienteItem['motivo'] => {
  if (m?.origen === 'equipo_parcial' || (m?.origen === 'cotizacion_menor' && !m?.reason)) return 'sobrante_de_presupuesto';
  if (m?.origen === 'cancelacion') return 'cancelacion';
  if (String(m?.reason || '').startsWith('price_decrease') || m?.previousPrice !== undefined || m?.oldPrice !== undefined) return 'baja_de_precio';
  return 'otro';
};

/** Cada cosa que el cliente tiene a favor PENDIENTE, con su motivo y la fecha en que pasa a su saldo (la más próxima primero). */
export async function aFavorPendienteDetalle(userId: string): Promise<AFavorPendienteItem[]> {
  const { sequelize } = await import('../config/database.js');
  const filas = (await sequelize.query(
    `SELECT id, amount, description, metadata FROM balance_transactions
      WHERE user_id = :userId AND status = 'pending' AND amount > 0 AND metadata->>'pendienteDeLiquidacion' = 'true'
      ORDER BY (metadata->>'disponibleDesde')::timestamptz ASC NULLS LAST LIMIT 50`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  )) as Array<{ id: string; amount: string | number; description: string; metadata: Record<string, any> | null }>;
  return filas.map((f) => ({
    id: String(f.id),
    monto: r2(Number(f.amount) || 0),
    motivo: motivoDelAFavor(f.metadata),
    descripcion: String(f.description || ''),
    disponibleDesde: f.metadata?.disponibleDesde ? String(f.metadata.disponibleDesde) : null,
  }));
}

/**
 * Las tarjetas de «Cobros pendientes» de una persona: lo que tiene a favor pendiente de liquidar (devoluciones, todavía fuera de su saldo) y lo que ya está
 * en su saldo pero no se puede retirar hasta una fecha (por ejemplo lo que cobra un trabajador por un contrato). Cada una dice a qué contrato y a qué
 * trabajo pertenece, para que se pueda abrir. La más próxima a liberarse, primero.
 */
export async function cobrosPendientes(userId: string, ahora: Date = new Date()): Promise<CobroPendiente[]> {
  const { sequelize } = await import('../config/database.js');
  const filas = (await sequelize.query(
    `SELECT id, amount, status, description, metadata, related_contract_id AS "contratoId"
       FROM balance_transactions
      WHERE user_id = :userId AND amount > 0 AND (
              (status = 'pending' AND metadata->>'pendienteDeLiquidacion' = 'true')
           OR (status = 'completed' AND metadata ? 'disponibleDesde' AND (metadata->>'disponibleDesde')::timestamptz > :ahora)
            )
      ORDER BY (metadata->>'disponibleDesde')::timestamptz ASC NULLS LAST
      LIMIT 50`,
    { replacements: { userId, ahora }, type: QueryTypes.SELECT },
  )) as Array<{ id: string; amount: string | number; status: string; description: string; metadata: Record<string, any> | null; contratoId: string | null }>;
  if (filas.length === 0) return [];

  const idDe = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const refs = filas.map((f) => {
    const m = f.metadata || {};
    return {
      contratoId: idDe(f.contratoId) ?? idDe(m.contractId) ?? (m.relatedModel === 'Contract' ? idDe(m.relatedId) : null),
      trabajoId: idDe(m.jobId) ?? (m.relatedModel === 'Job' ? idDe(m.relatedId) : null),
    };
  });

  const { Contract } = await import('../models/sql/Contract.model.js');
  const { Job } = await import('../models/sql/Job.model.js');
  const contratos = new Map<string, { jobId: string | null }>();
  const idsDeContratos = [...new Set(refs.map((r) => r.contratoId).filter((x): x is string => !!x))];
  if (idsDeContratos.length) {
    for (const c of (await Contract.findAll({ where: { id: idsDeContratos } as any, attributes: ['id', 'jobId'] })) as any[]) contratos.set(String(c.id), { jobId: c.jobId ? String(c.jobId) : null });
  }
  const idsDeTrabajos = [...new Set([...refs.map((r) => r.trabajoId), ...[...contratos.values()].map((c) => c.jobId)].filter((x): x is string => !!x))];
  const titulos = new Map<string, string>();
  if (idsDeTrabajos.length) {
    for (const j of (await Job.findAll({ where: { id: idsDeTrabajos } as any, attributes: ['id', 'title'] })) as any[]) titulos.set(String(j.id), String(j.title || ''));
  }

  return filas.map((f, i) => {
    const m = f.metadata || {};
    const aFavor = f.status === 'pending';
    const trabajoId = refs[i].trabajoId ?? (refs[i].contratoId ? contratos.get(refs[i].contratoId!)?.jobId ?? null : null);
    const referencia = (id: string | null): ReferenciaDelCobro | null => (id ? { id, titulo: titulos.get(trabajoId ?? '') || 'Trabajo' } : null);
    return {
      id: String(f.id),
      tipo: aFavor ? 'a_favor' : 'en_liberacion',
      monto: r2(Number(f.amount) || 0),
      etiqueta: aFavor ? etiquetaDelAFavor(motivoDelAFavor(m)) : 'Cobro por un trabajo',
      descripcion: String(f.description || ''),
      disponibleDesde: m.disponibleDesde ? String(m.disponibleDesde) : null,
      trabajo: trabajoId ? { id: trabajoId, titulo: titulos.get(trabajoId) || 'Trabajo' } : null,
      contrato: referencia(refs[i].contratoId),
    } satisfies CobroPendiente;
  });
}

/** Cuándo libera Mercado Pago el pago de donde sale una devolución, y cuál es ese pago (la devolución lo anota para poder comprobarlo al liquidarla). */
export interface LiberacionDeUnPago {
  /** undefined = ya está liberado (o no se sabe): no hay nada que esperar. */
  disponibleDesde?: string;
  pagoId?: string;
}

const ATRIBUTOS_DE_LIBERACION = ['id', 'approvedAt', 'paidAt', 'createdAt', 'moneyReleaseDate', 'paymentMethod'];

/** Liberación del pago de publicación de un trabajo (baja de precio, cancelación). */
export async function liberacionDeLaPublicacion(job: { publicationPaymentId?: string | null }): Promise<LiberacionDeUnPago> {
  if (!job?.publicationPaymentId) return {};
  try {
    const { Payment } = await import('../models/sql/Payment.model.js');
    const pago = await Payment.findByPk(job.publicationPaymentId, { attributes: ATRIBUTOS_DE_LIBERACION });
    return { disponibleDesde: disponibleDesdeDeUnaDevolucion(pago as any), pagoId: pago ? String((pago as any).id) : undefined };
  } catch {
    return {}; // sin el dato no se inventa una espera
  }
}

/** `disponibleDesde` de una devolución que viene del pago de publicación de un trabajo (baja de precio, cancelación). */
export async function disponibleDesdeDeLaPublicacion(job: { publicationPaymentId?: string | null }): Promise<string | undefined> {
  return (await liberacionDeLaPublicacion(job)).disponibleDesde;
}

/**
 * Liberación del pago de un contrato (baja del precio de un contrato, cancelación aprobada, trabajador que no puede). Si el contrato no tiene un pago
 * propio —los trabajos de varios lugares y las cotizaciones se pagan con el pago de la publicación— se usa el de la publicación del trabajo: sin esto
 * esas devoluciones se tomaban por ya liberadas y entraban al saldo con la plata todavía en Mercado Pago.
 */
export async function liberacionDelPagoDelContrato(contractId: string): Promise<LiberacionDeUnPago> {
  try {
    const { Payment } = await import('../models/sql/Payment.model.js');
    let pago: any = await Payment.findOne({ where: { contractId }, attributes: ATRIBUTOS_DE_LIBERACION, order: [['createdAt', 'ASC']] });
    if (!pago) {
      const { Contract } = await import('../models/sql/Contract.model.js');
      const { Job } = await import('../models/sql/Job.model.js');
      const contrato: any = await Contract.findByPk(contractId, { attributes: ['id', 'jobId'] });
      const trabajo: any = contrato?.jobId ? await Job.findByPk(contrato.jobId, { attributes: ['id', 'publicationPaymentId'] }) : null;
      if (trabajo?.publicationPaymentId) pago = await Payment.findByPk(trabajo.publicationPaymentId, { attributes: ATRIBUTOS_DE_LIBERACION });
    }
    return pago ? { disponibleDesde: disponibleDesdeDeUnaDevolucion(pago), pagoId: String(pago.id) } : {};
  } catch {
    return {};
  }
}

/** `disponibleDesde` de una devolución que viene del pago de un contrato (baja del precio de un contrato). */
export async function disponibleDesdeDelPagoDelContrato(contractId: string): Promise<string | undefined> {
  return (await liberacionDelPagoDelContrato(contractId)).disponibleDesde;
}
