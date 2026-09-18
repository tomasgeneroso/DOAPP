import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { liquidarCancelacion, pasarelaSinIva, type LiquidacionCancelacion } from '../../shared/pricing/processingCost.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { socketService } from '../index.js';

/**
 * Liquidar la cancelacion de una PUBLICACION (un trabajo, con o sin trabajador
 * seleccionado) y mover la plata. Una sola funcion para los tres caminos:
 *
 *   el cliente cancela una publicacion abierta     → regla 9.2 / 9.3
 *   un admin aprueba la cancelacion que pidio el   → regla 9.1 (sin trabajador:
 *     cliente mientras esperaba aprobacion            vuelve todo como saldo)
 *   un admin RECHAZA una publicacion pagada        → regla 9.1 tambien: el
 *                                                    cliente no hizo nada mal
 *
 * Lo que va al cliente es SALDO A FAVOR, bruto. Si despues lo retira a
 * efectivo, el retiro le descuenta lo que la liquidacion dejo anotado en
 * `alRetirar` (parte de la comision si no hubo trabajador, y la pasarela).
 * Esa anotacion viaja en la metadata del credito: es lo que lee balance.ts.
 *
 * El tercero no devolvia nada: rechazar ponia el trabajo en `cancelled` y la
 * plata quedaba en escrow para siempre.
 *
 * La regla de reparto es liquidarCancelacion (shared/pricing/processingCost.ts).
 * Aca solo se lee el pago, se llama, se acredita como saldo a favor, se avisa
 * a cada parte con SU numero, y queda en el libro.
 */

export interface ResultadoCancelacionPublicacion {
  liq: LiquidacionCancelacion;
  trabajadores: string[];
  porTrabajador: number;
}

const $ = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export async function liquidarCancelacionDePublicacion(
  job: Job,
  opts: {
    /** Si la publicacion habia sido aprobada por un admin. */
    aprobada: boolean;
    /** Horas hasta el inicio (negativo si ya empezo). */
    horasHastaInicio: number;
    /** Quien dispara: el cliente, o un admin. Para el libro y los mensajes. */
    actor: { id: string; tipo: 'cliente' | 'admin' };
    motivo?: string | null;
  },
): Promise<ResultadoCancelacionPublicacion> {
  const jobPrice = Number(job.price) || 0;
  const selectedWorkers: string[] = Array.isArray(job.selectedWorkers) ? (job.selectedWorkers as any) : [];
  const hasWorker = selectedWorkers.length > 0;
  const esTardia = opts.horasHastaInicio <= POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES;

  // Comision e IVA tal como se cobraron: platformFee es la comision sin IVA,
  // amount es el total (precio + comision + IVA).
  let comision = 0;
  let iva = 0;
  let pagoReal: Payment | null = null;
  if (job.publicationPaymentId) {
    pagoReal = await Payment.findByPk(job.publicationPaymentId).catch(() => null);
    if (pagoReal) {
      comision = Number((pagoReal as any).platformFee) || 0;
      const total = Number((pagoReal as any).amount) || 0;
      iva = Math.max(0, total - jobPrice - comision);
    }
  }

  // La pasarela REAL de este pago si el webhook la trajo (viene con IVA; se
  // le saca, el IVA es credito fiscal de DOAPP); si no, la tarifa configurada
  // (liquidarCancelacion la toma del entorno, ya sin IVA).
  const feeReal = Number((pagoReal as any)?.processingFee);
  const totalCobrado = jobPrice + comision + iva;
  const rate = Number.isFinite(feeReal) && feeReal > 0 && totalCobrado > 0 ? pasarelaSinIva(feeReal) / totalCobrado : undefined;

  const liq = liquidarCancelacion({
    precio: jobPrice,
    comision,
    iva,
    aprobada: opts.aprobada,
    hayTrabajador: hasWorker,
    tardia: esTardia,
    parteTrabajador: POLITICAS.CANCELACION_TARDIA_PARTE_TRABAJADOR,
    rate,
  });

  // Al cliente, como saldo a favor
  if (liq.aCliente > 0) {
    const client = await User.findByPk(job.clientId);
    if (client) {
      const before = parseFloat((client as any).balanceArs as any) || 0;
      await (client as any).addBalance(liq.aCliente);
      await BalanceTransaction.create({
        userId: job.clientId,
        type: 'refund',
        amount: liq.aCliente,
        balanceBefore: before,
        balanceAfter: before + liq.aCliente,
        description: `Saldo a favor por cancelación de "${job.title}"`,
        status: 'completed',
        metadata: {
          reason: `job_cancelled_${liq.regla}`,
          origen: 'cancelacion',
          jobId: job.id,
          jobPrice,
          costoPasarela: liq.costoPasarela,
          retieneApp: liq.retieneApp,
          aTrabajador: liq.aTrabajador,
          // Lo que se descuenta si retira este saldo a efectivo. Lo lee el retiro.
          alRetirar: liq.alRetirar,
          horasHastaInicio: Math.round(opts.horasHastaInicio * 100) / 100,
          actor: opts.actor,
        },
      } as any);

      await Notification.create({
        recipientId: job.clientId,
        type: 'success',
        category: 'payment',
        title: 'Saldo a favor acreditado',
        message: mensajeDeCancelacion(liq, job.title),
        relatedModel: 'Job',
        relatedId: job.id,
        read: false,
      } as any);
    }
  }

  // Al trabajador: la mitad de la bolsa por el dia que reservo y perdio.
  const porTrabajador = liq.aTrabajador > 0 && hasWorker
    ? Math.round((liq.aTrabajador / selectedWorkers.length) * 100) / 100
    : 0;

  if (porTrabajador > 0) {
    const { default: emailService } = await import('./email.js');
    for (const workerId of selectedWorkers) {
      const worker = await User.findByPk(workerId).catch(() => null);
      if (!worker) continue;
      const before = parseFloat((worker as any).balanceArs as any) || 0;
      await (worker as any).addBalance(porTrabajador);
      await BalanceTransaction.create({
        userId: workerId,
        type: 'payment',
        amount: porTrabajador,
        balanceBefore: before,
        balanceAfter: before + porTrabajador,
        description: `Compensación por cancelación tardía de "${job.title}"`,
        status: 'completed',
        metadata: { reason: 'job_cancelled_late_compensation', jobId: job.id, jobPrice, costoPasarela: liq.costoPasarela },
      } as any);
      await Notification.create({
        recipientId: workerId,
        type: 'warning',
        category: 'payment',
        title: 'El cliente canceló el trabajo',
        message: `"${job.title}" fue cancelado con menos de ${POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES} horas de anticipación. Por el día que reservaste se te acreditaron ${$(porTrabajador)} a tu saldo. Podés pedir la transferencia desde tu balance.`,
        relatedModel: 'Job',
        relatedId: job.id,
        read: false,
      } as any);
      socketService.notifyUser(workerId, 'job_cancelled_compensation', { jobId: job.id, amount: porTrabajador });
      if ((worker as any).email) {
        emailService.sendEmail({
          to: (worker as any).email,
          subject: `Cancelaron "${job.title}" — tenés una compensación`,
          html: `
            <h2>El cliente canceló el trabajo</h2>
            <p>Hola <strong>${(worker as any).name || ''}</strong>, el cliente canceló <strong>"${job.title}"</strong> con menos de ${POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES} horas de anticipación.</p>
            <p>Por el día que reservaste te corresponde la mitad del precio, descontado el costo de la pasarela: <strong>${$(porTrabajador)}</strong>. Ya está en tu saldo de DOAPP y podés pedir la transferencia a tu cuenta desde la sección Balance.</p>
            <p style="color:#666;font-size:12px">Es lo que dicen los términos (punto 9.3). Si algo no te cierra, escribinos desde el centro de ayuda.</p>
          `,
        }).catch((e: any) => console.error('[cancelación] email al trabajador:', e?.message));
      }
    }
  }

  await logMoneyEvent({
    action: 'JOB_CANCELLED_SETTLED',
    actor: `${opts.actor.tipo === 'admin' ? 'admin' : 'user'}:${opts.actor.id}`,
    severity: liq.aTrabajador > 0 ? 'medium' : 'low',
    description: `Publicación cancelada (${opts.actor.tipo}). Regla: ${liq.regla}.${opts.motivo ? ` Motivo: ${opts.motivo}` : ''}`,
    userId: job.clientId,
    monto: jobPrice,
    moneda: 'ARS',
    metadata: { jobId: job.id, ...liq, tarifaReal: rate != null, horasHastaInicio: Math.round(opts.horasHastaInicio * 100) / 100, trabajadores: selectedWorkers },
  }).catch(() => {});

  return { liq, trabajadores: selectedWorkers, porTrabajador };
}

/**
 * El mensaje para el cliente, con el desglose y sin eufemismos. Dice las dos
 * cosas que importan: cuanto tiene ahora como saldo (y que usarlo no cuesta),
 * y cuanto le quedaria si lo retira a efectivo.
 */
export function mensajeDeCancelacion(liq: LiquidacionCancelacion, titulo?: string): string {
  const h = POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES;
  const que = titulo ? `"${titulo}"` : 'la publicación';
  const retencion = liq.alRetirar.comision + liq.alRetirar.pasarela;
  const enEfectivo = Math.max(0, liq.aCliente - retencion);
  const retiro = retencion > 0
    ? ` Si en cambio lo retirás a tu cuenta, recibís ${$(enEfectivo)}: se descuentan${liq.alRetirar.comision > 0 ? ` ${$(liq.alRetirar.comision)} de la comisión por la revisión ya hecha y` : ''} ${$(liq.alRetirar.pasarela)} del costo de la pasarela.`
    : '';
  const m: Record<LiquidacionCancelacion['regla'], string> = {
    antes_de_aprobar: `Se canceló ${que} antes de aprobarse. Tenés ${$(liq.aCliente)} de saldo a favor, todo lo que pagaste: podés volver a publicar sin pagar de nuevo.${retiro}`,
    sin_trabajador: `Se canceló ${que} sin trabajador seleccionado. Tenés ${$(liq.aCliente)} de saldo a favor, todo lo que pagaste: podés volver a publicar sin pagar de nuevo.${retiro}`,
    con_tiempo: `Se canceló ${que}. Tenés ${$(liq.aCliente)} de saldo a favor (el precio del trabajo; la comisión de publicación no se devuelve porque ya había un trabajador seleccionado).${retiro}`,
    tardia_con_trabajador: `Se canceló ${que} con menos de ${h} horas. La mitad del precio es para el trabajador que reservó el día (${$(liq.aTrabajador)}, ya neto de pasarela); la otra mitad, ${$(liq.aCliente)}, es tu saldo a favor. La comisión de publicación no se devuelve.${retiro}`,
  };
  return m[liq.regla];
}
