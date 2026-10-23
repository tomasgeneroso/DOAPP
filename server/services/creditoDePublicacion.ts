import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import BalanceTransaction from '../models/sql/BalanceTransaction.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';

/**
 * Saldo vinculado a una publicación.
 *
 * Cuando una publicación se cancela sin trabajador, su precio vuelve como saldo a favor. Esa plata NO es ganada trabajando: es de esa
 * publicación (`jobs.publication_credit`) y alcanza para volver a publicarla. Reglas:
 *  - Reprogramar una publicación ya devuelta la deja en «pendiente de pago»: se paga (con este saldo o por la pasarela), no sale gratis.
 *  - Si el cliente retira ese saldo, el crédito de la publicación baja; para publicarla de nuevo hay que pagar entera otra vez.
 *  - Una publicación se devuelve una sola vez por pago: al pagarla de nuevo es otro pago y vuelve a poder devolverse.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ¿Este asiento es la devolución de una PUBLICACIÓN cancelada (la que arma `liquidarCancelacionDePublicacion`)? Otras devoluciones también llevan
 * `origen: 'cancelacion'` —la de un trabajador que no está disponible, la de un contrato cancelado— pero su respaldo es el pago del contrato, no el
 * de la publicación: no se las juzga con las reglas de la publicación (pago registrado, una sola devolución por pago).
 */
export const esDevolucionDeLaPublicacion = (meta: any): boolean =>
  meta?.origen === 'cancelacion' && typeof meta?.reason === 'string' && meta.reason.startsWith('job_cancelled_');

/** Marca el saldo que volvió de esta publicación como suyo. */
export async function vincularCredito(jobId: string, monto: number): Promise<void> {
  await Job.update({ publicationCredit: r2(Math.max(0, monto)) } as any, { where: { id: jobId } });
}

/**
 * ¿El pago actual de esta publicación ya se devolvió al saldo? El libro lo dice: la devolución anota el pago del que salió. Una devolución
 * vieja sin pago anotado (`pagoId` vacío) también cuenta: sin esto, reprogramar esa publicación saldría gratis.
 */
export async function publicacionDevuelta(job: { id: string; publicationPaymentId?: string | null }): Promise<boolean> {
  if (!job.publicationPaymentId) return false;
  const base = { origen: 'cancelacion', jobId: String(job.id) };
  const fila = await BalanceTransaction.findOne({
    // Un asiento «failed» (cancelado, por ejemplo al anular el pago) no devolvió nada.
    where: { type: 'refund', status: { [Op.ne]: 'failed' }, [Op.or]: [{ metadata: { ...base, pagoId: String(job.publicationPaymentId) } }, { metadata: { ...base, pagoId: null } }] } as any,
    attributes: ['id'],
  }).catch(() => null);
  return !!fila;
}

/**
 * ¿La plata de esta publicación ya volvió al cliente por la CANCELACIÓN de la publicación (la que arma `liquidarCancelacionDePublicacion`)?
 *
 * Más estricta que `publicacionDevuelta`, que cuenta cualquier devolución con `origen: 'cancelacion'` de este trabajo y a la que le falte el pago —también la que
 * deja un trabajador que no podía—. Eso está bien para decidir si reprogramar una publicación CANCELADA se paga de nuevo, pero no para decidir si una
 * cancelación automática devuelve el dinero: si el cliente eligió «republicar por menos», el trabajo sigue abierto con el resto del dinero adentro, y si vence
 * sin postulantes ese resto tiene que volver. Con `publicacionDevuelta` no volvía nunca.
 */
export async function publicacionDevueltaPorCancelacion(job: { id: string; publicationPaymentId?: string | null }): Promise<boolean> {
  if (!job.publicationPaymentId) return false;
  const base = { origen: 'cancelacion', jobId: String(job.id) };
  const filas: any[] = await BalanceTransaction.findAll({
    where: { type: 'refund', status: { [Op.ne]: 'failed' }, [Op.or]: [{ metadata: { ...base, pagoId: String(job.publicationPaymentId) } }, { metadata: { ...base, pagoId: null } }] } as any,
    attributes: ['id', 'metadata'],
    limit: 20,
  }).catch(() => []);
  return filas.some((f) => esDevolucionDeLaPublicacion(f.metadata));
}

/** ¿El libro muestra que el cliente pagó esta publicación con su saldo? (un descuento por la publicación; las pagadas con saldo antes de que existiera el registro de pago) */
export async function pagadaConSaldoSegunElLibro(jobId: string): Promise<boolean> {
  const fila = await BalanceTransaction.findOne({
    where: { type: 'adjustment', metadata: { relatedModel: 'Job', relatedId: String(jobId) } } as any,
    attributes: ['id'],
  }).catch(() => null);
  return !!fila;
}

export interface CreditoVinculado {
  jobId: string;
  titulo: string;
  monto: number;
}

/**
 * Los créditos de publicaciones del usuario, acotados a su saldo: si gastó saldo en otra cosa, no puede haber más plata vinculada que
 * saldo. Se recorta primero lo más viejo (lo más nuevo se conserva).
 */
export async function creditosVinculados(userId: string, saldo: number, opciones: { ignorarReservado?: boolean } = {}): Promise<CreditoVinculado[]> {
  const { reservadoEnRetiros } = await import('./saldoReservado.js');
  const reservado = opciones.ignorarReservado ? 0 : await reservadoEnRetiros(userId);
  const trabajos: any[] = await Job.findAll({
    where: { clientId: userId, publicationCredit: { [Op.gt]: 0 } } as any,
    attributes: ['id', 'title', 'publicationCredit', 'cancelledAt', 'updatedAt'],
    order: [['updatedAt', 'DESC']],
  });
  // Lo reservado para un retiro pendiente no cuenta: no se puede usar para volver a publicar.
  let queda = Math.max(0, saldo - reservado);
  const out: CreditoVinculado[] = [];
  for (const j of trabajos) {
    const monto = r2(Math.min(Number(j.publicationCredit) || 0, queda));
    if (monto <= 0) continue;
    out.push({ jobId: String(j.id), titulo: String(j.title), monto });
    queda = r2(queda - monto);
  }
  return out;
}

export interface DesgloseDelSaldo {
  total: number;
  /** Pedido para un retiro y todavía sin descontar: no se puede usar en otra cosa. */
  reservadoEnRetiro: number;
  /** Lo que no está vinculado a ninguna publicación (ganado trabajando, devoluciones de otro tipo, etc.). */
  libre: number;
  /** Lo vinculado a publicaciones canceladas. */
  vinculado: number;
  publicaciones: CreditoVinculado[];
}

export async function desgloseDelSaldo(userId: string, saldo: number, opciones: { ignorarReservado?: boolean } = {}): Promise<DesgloseDelSaldo> {
  const { reservadoEnRetiros } = await import('./saldoReservado.js');
  const reservadoEnRetiro = opciones.ignorarReservado ? 0 : await reservadoEnRetiros(userId);
  const publicaciones = await creditosVinculados(userId, saldo, opciones);
  const vinculado = r2(publicaciones.reduce((s, c) => s + c.monto, 0));
  return { total: r2(saldo), reservadoEnRetiro, libre: r2(Math.max(0, saldo - reservadoEnRetiro - vinculado)), vinculado, publicaciones };
}

/**
 * Al retirar `monto` del saldo: se gasta primero lo libre y recién después lo vinculado (lo más viejo primero). Lo vinculado que se retira
 * baja el crédito de su publicación y se le avisa al cliente que esa publicación ya no se puede reprogramar sin pagar de nuevo.
 * Devuelve las publicaciones afectadas.
 */
export async function consumirCreditosAlRetirar(userId: string, monto: number, saldoAntes: number): Promise<CreditoVinculado[]> {
  const { libre, publicaciones } = await desgloseDelSaldo(userId, saldoAntes, { ignorarReservado: true });
  let sobre = r2(monto - libre);
  if (sobre <= 0) return [];
  const afectadas: CreditoVinculado[] = [];
  // Del más viejo al más nuevo
  for (const c of [...publicaciones].reverse()) {
    if (sobre <= 0) break;
    const sacado = r2(Math.min(c.monto, sobre));
    const nuevo = r2(c.monto - sacado);
    await Job.update({ publicationCredit: nuevo } as any, { where: { id: c.jobId } });
    afectadas.push({ ...c, monto: sacado });
    sobre = r2(sobre - sacado);
  }
  for (const a of afectadas) {
    await Notification.create({
      recipientId: userId,
      type: 'warning',
      category: 'payment',
      title: 'Retiraste el saldo de una publicación',
      message: `Retiraste $${a.monto.toLocaleString('es-AR')} que estaban vinculados a "${a.titulo}". Para volver a publicarla vas a tener que pagarla de nuevo.`,
      relatedModel: 'Job',
      relatedId: a.jobId,
      read: false,
    } as any).catch(() => {
      /* el retiro ya se hizo; el aviso es secundario */
    });
  }
  return afectadas;
}

/** Cuánto saldo puede USAR el usuario ya: el total menos lo reservado para un retiro pendiente. */
export async function saldoDe(userId: string): Promise<number> {
  const u: any = await User.findByPk(userId, { attributes: ['id', 'balanceArs'] });
  const { reservadoEnRetiros } = await import('./saldoReservado.js');
  return Math.max(0, r2((Number(u?.balanceArs) || 0) - (await reservadoEnRetiros(userId))));
}

export interface ResultadoPagoConSaldo {
  paymentId: string;
  monto: number;
  estado: 'pending_approval' | 'open';
}

/**
 * Paga una REPROGRAMACIÓN (publicación pendiente de pago cuyo pago volvió al saldo) con el saldo a favor, sin pasarela. La ruta ya comprobó
 * que el crédito vinculado a la publicación cubre el total. Deja un pago `completed` (método `balance`) que es el «pago actual» de la publicación: si se
 * vuelve a cancelar sin trabajador, se puede devolver otra vez (es otro pago).
 *
 * `monto` = precio + comisión + IVA de la comisión (no hay costo de procesamiento: no pasó por una pasarela).
 */
export async function pagarPublicacionConSaldo(
  job: Job,
  userId: string,
  monto: number,
  comision: { monto: number; porcentaje: number },
): Promise<ResultadoPagoConSaldo> {
  const [{ debitarSaldo }, { Payment }, { moduloActivo }, { MODULO_APROBACION_DE_PUBLICACIONES }, { DONDE_ES_ADMIN }] = await Promise.all([
    import('./quotePayment.js'),
    import('../models/sql/Payment.model.js'),
    import('./moduleFlags.js'),
    import('../../shared/constants/modulos.js'),
    import('../utils/admins.js'),
  ]);

  const total = r2(monto);
  if (!(total > 0)) throw new Error('El monto de la publicación debe ser mayor a cero.');

  // El pago primero: si el saldo no alcanza, debitarSaldo falla y no cambia nada.
  await debitarSaldo(String(userId), total, `Publicación "${job.title}" pagada con saldo`, {
    relatedModel: 'Job',
    relatedId: String(job.id),
    metadata: { origen: 'publicacion_con_saldo', jobId: String(job.id) },
  });

  const pago: any = await Payment.create({
    contractId: null,
    payerId: userId,
    recipientId: null,
    amount: total,
    currency: 'ARS',
    status: 'completed',
    paymentType: 'job_publication',
    paymentMethod: 'balance',
    description: `Publicación pagada con saldo: ${job.title}`,
    platformFee: comision.monto,
    platformFeePercentage: comision.porcentaje,
    isEscrow: false,
  } as any);

  const requiereAprobacion = await moduloActivo(MODULO_APROBACION_DE_PUBLICACIONES, true);
  const estado = requiereAprobacion ? 'pending_approval' : 'open';
  await Job.update(
    {
      status: estado,
      publicationPaid: true,
      publicationPaidAt: new Date(),
      publicationPaymentId: pago.id,
      publicationAmount: total,
      // El crédito de esta publicación se usó entero: lo que sobre (si bajó el precio) queda como saldo libre.
      publicationCredit: 0,
    } as any,
    { where: { id: job.id } },
  );

  await Notification.create({
    recipientId: userId,
    type: requiereAprobacion ? 'info' : 'success',
    category: 'payment',
    title: requiereAprobacion ? 'Publicación pagada con saldo: en revisión' : 'Trabajo publicado',
    message: requiereAprobacion
      ? `Pagaste "${job.title}" con tu saldo ($${total.toLocaleString('es-AR')}). Un administrador la revisa y, apenas la apruebe, queda visible.`
      : `Pagaste "${job.title}" con tu saldo ($${total.toLocaleString('es-AR')}) y ya está publicada.`,
    relatedModel: 'Job',
    relatedId: String(job.id),
    sentVia: ['in_app'],
  } as any).catch(() => {});

  if (requiereAprobacion) {
    const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN } });
    for (const admin of admins) {
      await Notification.create({
        recipientId: admin.id,
        type: 'warning',
        category: 'admin',
        title: 'Publicación pagada para aprobar',
        message: `El cliente pagó con saldo la publicación "${job.title}" ($${total.toLocaleString('es-AR')} ARS). Aprobala o rechazala desde Publicaciones.`,
        relatedModel: 'Job',
        relatedId: String(job.id),
        sentVia: ['in_app'],
      } as any).catch(() => {});
    }
  }

  return { paymentId: String(pago.id), monto: total, estado };
}
