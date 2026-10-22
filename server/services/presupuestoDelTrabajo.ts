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
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const $ = (n: number) => `$${n.toLocaleString('es-AR')}`;

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
 * Lo que ya volvió al saldo del cliente por no usarse. Cuentan las devoluciones de esta publicación por «cotizacion_menor» sin motivo (las que
 * hacía la aprobación de una propuesta, antes de este cambio) y las de «equipo_parcial». NO cuentan las bajas de precio (`reason: price_decrease`):
 * esas también bajan `job.price`, así que contarlas descontaría dos veces.
 */
export async function presupuestoDevuelto(jobId: string): Promise<number> {
  const filas = (await conSistema(() =>
    sequelize.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM balance_transactions
        WHERE type = 'refund' AND status = 'completed' AND metadata->>'jobId' = :jobId
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
  /** Lo que se acreditó al saldo del cliente (0 si no sobraba nada o el equipo sigue abierto). */
  devuelto: number;
  pagado: number;
  contratado: number;
  /** Texto para el cliente («te quedaron $X a favor en tu saldo»). */
  aviso?: string;
  /** La notificación creada, por si quien llama quiere emitirla por socket. */
  notificacion?: { toJSON: () => unknown };
}

const NADA: PresupuestoDevuelto = { devuelto: 0, pagado: 0, contratado: 0 };

/**
 * Devuelve al saldo del cliente lo que sobró del presupuesto, si el equipo ya está cerrado. Idempotente: lo sobrante se calcula de los contratos y
 * del libro, así que repetirlo (la ruta y el barrido a la vez, un reintento) no acredita dos veces. Un candado por trabajo evita que dos corridas
 * simultáneas lean el mismo estado.
 *
 * El crédito queda disponible para retirar cuando Mercado Pago libera el pago original; usarlo dentro de la app no espera. NO crea ningún pedido de
 * retiro.
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

    const { acreditarSaldo } = await import('./quotePayment.js');
    await acreditarSaldo(
      String(job.clientId),
      sobrante,
      contratos === 1
        ? `Diferencia a favor: publicaste por ${$(pagado)} y la cotización aceptada fue de ${$(contratado)}.`
        : `Diferencia a favor: publicaste por ${$(pagado)} y los trabajadores contratados suman ${$(contratado)}.`,
      {
        relatedModel: 'Job',
        relatedId: job.id,
        // Este saldo no se ganó trabajando: es plata que el cliente ya pagó y que vuelve. Se retira recién cuando Mercado Pago libera el pago
        // original (ver services/liberacionDeSaldo.ts).
        metadata: { origen: varios ? 'equipo_parcial' : 'cotizacion_menor', jobId: String(job.id), contratado, pagado, disponibleDesde: await disponibleDesdeDeLaPublicacion(job) },
      },
    );

    const aviso =
      contratos === 1
        ? `La cotización aceptada (${$(contratado)}) es menor a lo que pagaste por la publicación (${$(pagado)}): te quedaron ${$(sobrante)} a favor en tu saldo.`
        : `Los trabajadores contratados suman ${$(contratado)} y pagaste ${$(pagado)} por la publicación: te quedaron ${$(sobrante)} a favor en tu saldo.`;
    let notificacion: PresupuestoDevuelto['notificacion'];
    try {
      notificacion = (await Notification.create({
        recipientId: job.clientId,
        type: 'info',
        category: 'payment',
        title: 'Te quedó saldo a favor',
        message: `${aviso} Lo podés usar o retirar desde Balance (se habilita cuando Mercado Pago libera el pago original). No se retira solo: el retiro lo pedís vos.`,
        relatedModel: 'Job',
        relatedId: job.id,
        actionText: 'Ver balance',
        data: { jobId: job.id, saldoAFavor: sobrante },
        read: false,
      } as never)) as unknown as PresupuestoDevuelto['notificacion'];
    } catch (e) {
      console.error('[presupuesto] no se pudo avisar al cliente del saldo a favor:', (e as Error).message);
    }
    return { devuelto: sobrante, pagado, contratado, aviso, notificacion };
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

/** El barrido: busca los trabajos con el equipo cerrado y presupuesto sin usar, y lo devuelve. Devuelve cuántos trabajos tenían algo para devolver. */
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
