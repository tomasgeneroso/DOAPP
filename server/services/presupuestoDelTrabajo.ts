import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { conSistema } from '../db/contextoRls.js';
import { disponibleDesdeDeLaPublicacion } from './liberacionDeSaldo.js';
import { avisarProblemasDeDinero } from './controlesDeDinero.js';

/**
 * El presupuesto de una publicación PAGADA, repartido entre los trabajadores que se eligen.
 *
 * Lo que el cliente pagó al publicar (`job.price`) respalda los contratos de los trabajadores elegidos. Lo que no se contrató es del cliente y vuelve a
 * su SALDO: un asiento del libro. Nunca un pedido de retiro: sacar esa plata al banco es una decisión suya, desde «Solicitar retiro».
 *
 * Vuelve RECIÉN cuando se sabe que no se va a contratar, es decir cuando el equipo queda cerrado: completo, o empezó con menos lugares. Mientras
 * queden lugares por cubrir, lo que no está contratado es el presupuesto de esos lugares. Antes se devolvía en cada elección, comparando la cotización
 * de ESE trabajador contra el presupuesto entero: en un trabajo de $5.000 para dos, elegir al primero por $2.500 devolvía $2.500 que eran del segundo, y
 * elegir al segundo devolvía otros $2.500 (o fallaba después de haberlos acreditado). Lo contratado y lo ya devuelto salen de los contratos y del libro,
 * no de un contador: el barrido puede repetirse sin devolver dos veces.
 *
 * Y es a favor PENDIENTE hasta que la plata existe de verdad en la cuenta de la plataforma. El pago del cliente sigue en Mercado Pago hasta su fecha de
 * liberación (unos diez días): hasta entonces lo que sobró es un asiento «pending» que NO suma al saldo (no se puede usar ni retirar). Al llegar la fecha,
 * `liquidarSaldosPendientes` lo pasa a saldo y recién ahí el cliente lo tiene. Si el pago original ya está liberado (o no es de Mercado Pago), se suma al
 * saldo en el momento.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const $ = (n: number) => `$${n.toLocaleString('es-AR')}`;
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-AR');

/** Un contrato cancelado o rechazado ya no usa presupuesto: ese lugar vuelve a estar libre. */
const ESTADOS_SIN_PRESUPUESTO = ['cancelled', 'rejected'];

export interface TrabajoConPresupuesto {
  id: string | number;
  price?: unknown;
  publicationPaid?: unknown;
  pricingMode?: unknown;
}

/** Lo que suman los contratos vigentes del trabajo. */
export async function presupuestoContratado(jobId: string): Promise<number> {
  const total = await Contract.sum('price', { where: { jobId, status: { [Op.notIn]: ESTADOS_SIN_PRESUPUESTO } } as never });
  return Number(total) || 0;
}

/**
 * Lo que ya volvió al cliente por no usarse, esté en su saldo o pendiente de liquidar. Cuentan las devoluciones de esta publicación por
 * «cotizacion_menor» sin motivo (las que hacía la aprobación de una propuesta, antes de este cambio) y las de «equipo_parcial». NO cuentan las bajas de
 * precio (`reason: price_decrease`): esas también bajan `job.price`, así que contarlas descontaría dos veces.
 */
export async function presupuestoDevuelto(jobId: string): Promise<number> {
  const filas = (await conSistema(() =>
    sequelize.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM balance_transactions
        WHERE type = 'refund' AND status IN ('completed', 'pending') AND metadata->>'jobId' = :jobId
          AND (metadata->>'origen' = 'equipo_parcial' OR (metadata->>'origen' = 'cotizacion_menor' AND NOT (metadata ? 'reason')))`,
      { replacements: { jobId: String(jobId) }, type: QueryTypes.SELECT },
    ),
  )) as Array<{ total: string | number }>;
  return Number(filas[0]?.total) || 0;
}

/**
 * Cuánto del presupuesto pagado no está contratado ni devuelto. Un trabajo que no se pagó a precio fijo no tiene presupuesto que repartir: 0.
 * Es lo que respalda a un trabajador más (si cotiza más, la diferencia se cobra) y lo que sobra al cerrar el equipo.
 */
export async function presupuestoSinAsignar(job: TrabajoConPresupuesto): Promise<number> {
  const pagado = job.publicationPaid && job.pricingMode === 'fixed' ? Number(job.price) || 0 : 0;
  if (pagado <= 0) return 0;
  const [contratado, devuelto] = await Promise.all([presupuestoContratado(String(job.id)), presupuestoDevuelto(String(job.id))]);
  return r2(Math.max(0, pagado - contratado - devuelto));
}

/** ¿Ya no se va a contratar a nadie más? Con al menos un trabajador elegido: el equipo está completo o el trabajo ya empezó (o terminó). */
export function equipoCerrado(job: { status?: unknown; selectedWorkers?: unknown; maxWorkers?: unknown }): boolean {
  const elegidos = Array.isArray(job.selectedWorkers) ? job.selectedWorkers.length : 0;
  if (elegidos < 1) return false;
  return elegidos >= (Number(job.maxWorkers) || 1) || job.status === 'in_progress' || job.status === 'completed';
}

export interface PresupuestoDevuelto {
  /** Lo que quedó a favor del cliente (0 si no sobraba nada o el equipo sigue abierto). */
  devuelto: number;
  /** true si es a favor PENDIENTE de liquidar: todavía no está en su saldo. false si ya se sumó al saldo. */
  pendiente?: boolean;
  /** Cuándo pasa a ser saldo, si es pendiente (ISO). */
  disponibleDesde?: string;
  pagado: number;
  contratado: number;
  /** Texto para el cliente. */
  aviso?: string;
  /** La notificación creada, por si quien llama quiere emitirla por socket. */
  notificacion?: { toJSON: () => unknown };
}

const NADA: PresupuestoDevuelto = { devuelto: 0, pagado: 0, contratado: 0 };

/**
 * Deja a favor del cliente lo que sobró del presupuesto, si el equipo ya está cerrado. Idempotente: lo sobrante se calcula de los contratos y del
 * libro, así que repetirlo (la ruta y el barrido a la vez, un reintento) no lo duplica. Un candado por trabajo evita que dos corridas simultáneas lean
 * el mismo estado.
 *
 * Es a favor PENDIENTE mientras Mercado Pago no libere el pago original (ver arriba) y saldo en el momento si ya lo liberó. NO crea ningún pedido de retiro.
 */
export async function devolverPresupuestoSinUsar(jobId: string, opciones: { lugaresPedidos?: number } = {}): Promise<PresupuestoDevuelto> {
  return sequelize.transaction(async (t) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', { replacements: { clave: `presupuesto:${jobId}` }, transaction: t });
    const job = (await Job.findByPk(jobId, { transaction: t })) as any;
    if (!job || !equipoCerrado(job)) return NADA;

    const sobrante = await presupuestoSinAsignar(job);
    if (sobrante < 0.01) return NADA;

    const pagado = Number(job.price) || 0;
    const contratado = await presupuestoContratado(String(job.id));
    const contratos = await Contract.count({ where: { jobId: job.id, status: { [Op.notIn]: ESTADOS_SIN_PRESUPUESTO } } as never });
    const varios = (opciones.lugaresPedidos ?? (Number(job.maxWorkers) || 1)) > 1;
    const descripcion =
      contratos === 1
        ? `Diferencia a favor: publicaste por ${$(pagado)} y la cotización aceptada fue de ${$(contratado)}.`
        : `Diferencia a favor: publicaste por ${$(pagado)} y los trabajadores contratados suman ${$(contratado)}.`;
    const disponibleDesde = await disponibleDesdeDeLaPublicacion(job);
    const metadata = {
      origen: varios ? 'equipo_parcial' : 'cotizacion_menor',
      jobId: String(job.id),
      contratado,
      pagado,
      pagoId: job.publicationPaymentId ? String(job.publicationPaymentId) : undefined,
    };

    const { acreditarSaldo, acreditarSaldoPendiente } = await import('./quotePayment.js');
    if (disponibleDesde) {
      // El pago original todavía está en Mercado Pago: lo que sobró es del cliente, pero todavía no lo tiene. Pasa a su saldo en esa fecha.
      await acreditarSaldoPendiente(String(job.clientId), sobrante, descripcion, { relatedModel: 'Job', relatedId: job.id, metadata: { ...metadata, disponibleDesde } });
    } else {
      // sin-espera: el pago original ya está liberado (o no pasó por Mercado Pago): la plata existe en la cuenta de la plataforma, es saldo en el momento.
      await acreditarSaldo(String(job.clientId), sobrante, descripcion, { relatedModel: 'Job', relatedId: job.id, metadata });
    }

    const queda =
      contratos === 1
        ? `La cotización aceptada (${$(contratado)}) es menor a lo que pagaste por la publicación (${$(pagado)})`
        : `Los trabajadores contratados suman ${$(contratado)} y pagaste ${$(pagado)} por la publicación`;
    const aviso = disponibleDesde
      ? `${queda}: te quedan ${$(sobrante)} a favor, PENDIENTES de liquidar. Pasan a tu saldo el ${dia(disponibleDesde)}, cuando Mercado Pago libera el pago original; hasta entonces todavía no son tuyos.`
      : `${queda}: te quedaron ${$(sobrante)} a favor en tu saldo.`;
    let notificacion: PresupuestoDevuelto['notificacion'];
    try {
      notificacion = (await Notification.create({
        recipientId: job.clientId,
        type: 'info',
        category: 'payment',
        title: disponibleDesde ? 'Te quedó saldo a favor pendiente' : 'Te quedó saldo a favor',
        message: `${aviso} Cuando esté en tu saldo lo podés usar en la app o pedir su retiro desde Balance. No se retira solo: el retiro lo pedís vos.`,
        relatedModel: 'Job',
        relatedId: job.id,
        actionText: 'Ver balance',
        data: { jobId: job.id, saldoAFavor: sobrante, pendiente: !!disponibleDesde, disponibleDesde },
        read: false,
      } as never)) as unknown as PresupuestoDevuelto['notificacion'];
    } catch (e) {
      console.error('[presupuesto] no se pudo avisar al cliente del saldo a favor:', (e as Error).message);
    }
    return { devuelto: sobrante, pendiente: !!disponibleDesde, disponibleDesde, pagado, contratado, aviso, notificacion };
  });
}

/**
 * Lo mismo, pero sin que un fallo tire abajo lo que ya se hizo (el contrato ya existe, el trabajo ya empezó): avisa a administración y queda para el
 * próximo barrido, que lo reintenta solo.
 */
export async function intentarDevolverPresupuesto(jobId: string, opciones: { lugaresPedidos?: number } = {}): Promise<PresupuestoDevuelto> {
  try {
    return await devolverPresupuestoSinUsar(jobId, opciones);
  } catch (e) {
    await avisarProblemasDeDinero(
      [{ codigo: 'DEVOLUCION-DE-PRESUPUESTO-FALLIDA', detalle: `publicación ${jobId}: ${(e as Error).message}` }],
      { titulo: 'No se pudo devolver al saldo lo que sobró del presupuesto', relatedModel: 'Job', relatedId: jobId },
    );
    return NADA;
  }
}

/** El barrido: busca los trabajos con el equipo cerrado y presupuesto sin usar, y lo deja a favor del cliente. Devuelve cuántos trabajos tenían algo. */
export async function devolverPresupuestosSinUsar(): Promise<number> {
  const hace7Dias = new Date(Date.now() - 7 * 86_400_000);
  const candidatos = (await Job.findAll({
    where: {
      publicationPaid: true,
      pricingMode: 'fixed',
      [Op.and]: [sequelize.literal('cardinality("Job"."selected_workers") >= 1')],
      [Op.or]: [{ status: { [Op.in]: ['open', 'in_progress'] } }, { status: 'completed', updatedAt: { [Op.gte]: hace7Dias } }],
    } as never,
    attributes: ['id', 'status', 'selectedWorkers', 'maxWorkers'],
    order: [['updatedAt', 'DESC']],
    limit: 500,
  })) as unknown as Array<{ id: string; status: string; selectedWorkers: string[]; maxWorkers: number }>;

  let con = 0;
  for (const j of candidatos) {
    if (!equipoCerrado(j)) continue;
    const r = await intentarDevolverPresupuesto(String(j.id));
    if (r.devuelto > 0) con += 1;
  }
  return con;
}

/**
 * Pasa a saldo lo que estaba a favor pendiente y cuya fecha llegó: el pago original se liberó, la plata ya está en la cuenta de la plataforma y recién
 * ahora el cliente la tiene. Avisa al cliente. Si el pago original se devolvió o se cayó, no acredita y avisa a administración (una sola vez: el asiento
 * queda marcado). Devuelve cuántos asientos se liquidaron.
 */
export async function liquidarSaldosPendientes(ahora: Date = new Date()): Promise<number> {
  const { liquidarSaldoPendiente } = await import('./quotePayment.js');
  const vencidos = (await conSistema(() =>
    sequelize.query(
      `SELECT id FROM balance_transactions
        WHERE status = 'pending' AND amount > 0 AND metadata->>'pendienteDeLiquidacion' = 'true'
          AND COALESCE(metadata->>'disponibleDesde', '') <> '' AND (metadata->>'disponibleDesde')::timestamptz <= :ahora
          AND NOT (metadata ? 'bloqueada')
        ORDER BY created_at ASC LIMIT 500`,
      { replacements: { ahora }, type: QueryTypes.SELECT },
    ),
  )) as Array<{ id: string }>;

  let liquidados = 0;
  for (const { id } of vencidos) {
    try {
      const r = await liquidarSaldoPendiente(String(id), ahora);
      if (r.liquidado) {
        liquidados += 1;
        await Notification.create({
          recipientId: r.userId,
          type: 'success',
          category: 'payment',
          title: 'Ya tenés tu saldo a favor',
          message: `Mercado Pago liberó el pago original: ${$(r.monto)} pasaron a tu saldo. Los podés usar en la app o pedir su retiro desde Balance (el retiro lo pedís vos; no se hace solo).`,
          relatedModel: 'BalanceTransaction',
          relatedId: id,
          actionText: 'Ver balance',
          read: false,
        } as never).catch(() => undefined);
      } else if ('motivo' in r && r.motivo === 'pago_en_problemas') {
        await avisarProblemasDeDinero(
          [{ codigo: 'SALDO-PENDIENTE-BLOQUEADO', detalle: `asiento ${id} de ${$(r.monto ?? 0)} del usuario ${r.userId}: ${r.detalle}` }],
          { titulo: 'Un saldo a favor pendiente no se pudo liquidar', relatedModel: 'BalanceTransaction', relatedId: String(id), userId: r.userId },
        );
      }
    } catch (e) {
      console.error(`[presupuesto] no se pudo liquidar el asiento ${id}:`, (e as Error).message);
    }
  }
  return liquidados;
}
