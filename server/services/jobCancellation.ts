import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { liquidarCancelacion, type LiquidacionCancelacion } from '../../shared/pricing/processingCost.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { acreditarSaldo } from './quotePayment.js';
import { componentesDelPago } from './payoutAmount.js';

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
 * El cliente ELIGE por donde vuelve su plata (`salida`):
 *
 *   'saldo'      queda como saldo a favor, bruto, y republicar no cuesta. Si
 *                despues lo retira a un CBU, el retiro le descuenta lo que la
 *                liquidacion dejo anotado en `alRetirar` (parte de la comision
 *                si no hubo trabajador). Esa anotacion viaja en la metadata
 *                del credito: es lo que lee balance.ts.
 *   'devolucion' sale por Mercado Pago al mismo medio con que pago, ahora, ya
 *                neto de esa misma retencion. Es plata que se va de la
 *                plataforma, asi que paga lo mismo que pagaria al retirarse.
 *
 * La diferencia no es de trato sino de destino: mientras la plata se queda
 * adentro no cuesta nada, y cuando sale paga la revision que ya se hizo. Y a
 * DOAPP le conviene que lo que no se va a reusar salga por MP: deja de ser
 * dinero ajeno parado en la cuenta acumulando retenciones de Ingresos Brutos.
 *
 * El costo de procesamiento no entra en ningun lado: el cliente lo pago al
 * pagar y ya se fue a la pasarela.
 *
 * El tercer camino (rechazo) no devolvia nada: rechazar ponia el trabajo en
 * `cancelled` y la plata quedaba en escrow para siempre.
 *
 * La regla de reparto es liquidarCancelacion (shared/pricing/processingCost.ts).
 * Aca solo se lee el pago, se llama, se mueve la plata por donde el cliente
 * eligio, se avisa a cada parte con SU numero, y queda en el libro.
 *
 * NADA de esto puede fallar en silencio: cada movimiento va en su try, y lo
 * que no se pudo hacer vuelve en `errores` y le llega a administracion. Un
 * trabajo cancelado con la plata sin mover es el peor resultado posible, y es
 * el que hay que poder ver.
 */

export type SalidaDeLaPlata = 'saldo' | 'devolucion';

export interface ResultadoCancelacionPublicacion {
  liq: LiquidacionCancelacion;
  trabajadores: string[];
  porTrabajador: number;
  /** Por donde salio finalmente la plata del cliente. */
  salida: SalidaDeLaPlata;
  /** Lo que se devolvio por Mercado Pago, si esa fue la salida. */
  devueltoPorMp: number;
  /**
   * Lo que no se pudo hacer. Vacio es el caso normal. Si trae algo, la
   * cancelacion igual ocurrio pero hay plata que un humano tiene que mover.
   */
  errores: string[];
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
    /** Por donde quiere el cliente su plata. Por defecto, saldo a favor. */
    salida?: SalidaDeLaPlata;
  },
): Promise<ResultadoCancelacionPublicacion> {
  const errores: string[] = [];
  const jobPrice = Number(job.price) || 0;
  const selectedWorkers: string[] = Array.isArray(job.selectedWorkers) ? (job.selectedWorkers as any) : [];
  const hasWorker = selectedWorkers.length > 0;
  const esTardia = opts.horasHastaInicio <= POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES;

  // Comision, IVA y procesamiento tal como se cobraron, leidos del pago.
  // Si el pago no se puede leer se sigue igual con lo que se sabe del trabajo:
  // el cliente tiene que recuperar su plata aunque falle una consulta.
  let pagoReal: Payment | null = null;
  try {
    pagoReal = job.publicationPaymentId ? await Payment.findByPk(job.publicationPaymentId) : null;
  } catch (e: any) {
    errores.push(`no se pudo leer el pago de la publicación: ${e?.message}`);
  }
  const { comision, iva, procesamiento } = componentesDelPago(pagoReal as any, jobPrice);

  const liq = liquidarCancelacion({
    precio: jobPrice,
    comision,
    iva,
    procesamiento,
    aprobada: opts.aprobada,
    hayTrabajador: hasWorker,
    tardia: esTardia,
    parteTrabajador: POLITICAS.CANCELACION_TARDIA_PARTE_TRABAJADOR,
  });

  /**
   * Lo que sale por Mercado Pago si el cliente eligio esa salida: lo que le
   * toca, menos la parte de la comision que se retiene cuando la plata se va
   * de la plataforma. Es la misma cuenta que haria el retiro desde el saldo.
   */
  const netoSiSale = round2(Math.max(0, liq.aCliente - liq.alRetirar.comision));
  const mpPaymentId = (pagoReal as any)?.mercadopagoPaymentId;
  const yaDevuelto = Number((pagoReal as any)?.refundedAmount) || 0;

  // La devolucion por MP solo se ofrece si hay contra que devolver. Si el
  // cliente la pidio y no se puede, se cae a saldo: nunca se queda sin nada.
  let salida: SalidaDeLaPlata = opts.salida === 'devolucion' ? 'devolucion' : 'saldo';
  if (salida === 'devolucion' && (!mpPaymentId || netoSiSale <= 0 || yaDevuelto > 0)) {
    salida = 'saldo';
    if (liq.aCliente > 0) {
      errores.push(
        !mpPaymentId
          ? 'no hay un pago de Mercado Pago contra el cual devolver; se acreditó como saldo'
          : yaDevuelto > 0
            ? 'ese pago ya tuvo una devolución; se acreditó como saldo'
            : 'no quedaba monto para devolver; se acreditó como saldo',
      );
    }
  }

  let devueltoPorMp = 0;

  if (salida === 'devolucion') {
    try {
      const mercadoPagoService = (await import('./mercadopago.js')).default;
      // refundPayment deriva su propia clave de idempotencia del pago y el
      // monto, asi que un reintento no devuelve dos veces.
      const r = await mercadoPagoService.refundPayment(String(mpPaymentId), 'mercadopago', netoSiSale);
      devueltoPorMp = netoSiSale;

      if (pagoReal) {
        await pagoReal.update({
          refundedAmount: netoSiSale,
          refundedAt: new Date(),
          refundReason: `Cancelación de "${job.title}"`,
          status: 'refunded',
        } as any).catch((e: any) => {
          // La plata SALIO. Que no se haya podido anotar es grave y tiene que
          // verlo alguien, pero no se puede "deshacer" la devolucion.
          errores.push(`la devolución salió (${r.refundId}) pero no se pudo registrar en el pago: ${e?.message}`);
        });
      }

      await Notification.create({
        recipientId: job.clientId,
        type: 'success',
        category: 'payment',
        title: 'Devolución en camino',
        message:
          `Se canceló "${job.title}" y se devolvieron ${$(netoSiSale)} al mismo medio con que pagaste. ` +
          `Según el banco o la tarjeta puede tardar unos días en verse.` +
          (liq.alRetirar.comision > 0
            ? ` Se descontaron ${$(liq.alRetirar.comision)} de la comisión por la revisión que ya se hizo.`
            : '') +
          (liq.procesamientoNoVuelve > 0
            ? ` El costo de procesamiento del pago (${$(liq.procesamientoNoVuelve)}) no se devuelve: la pasarela ya lo cobró.`
            : ''),
        relatedModel: 'Job',
        relatedId: job.id,
        read: false,
      } as any).catch(() => { /* avisar es importante, pero la plata ya se movio */ });
    } catch (e: any) {
      // No salio por MP: se cae a saldo, que es el camino que no depende de
      // nadie de afuera. El cliente recupera todo y decide despues.
      salida = 'saldo';
      errores.push(`no se pudo devolver por Mercado Pago (${e?.message}); se acreditó como saldo a favor`);
    }
  }

  // Al cliente, como saldo a favor. acreditarSaldo bloquea la fila y escribe
  // el asiento en la misma transaccion: saldo y libro no pueden separarse.
  if (salida === 'saldo' && liq.aCliente > 0) {
    try {
      const client = await User.findByPk(job.clientId, { attributes: ['id'] });
      if (!client) throw new Error('el cliente del trabajo no existe');

      await acreditarSaldo(String(job.clientId), liq.aCliente, `Saldo a favor por cancelación de "${job.title}"`, {
        relatedModel: 'Job',
        relatedId: job.id,
        tipo: 'refund',
        metadata: {
          reason: `job_cancelled_${liq.regla}`,
          origen: 'cancelacion',
          jobId: job.id,
          jobPrice,
          procesamientoNoVuelve: liq.procesamientoNoVuelve,
          retieneApp: liq.retieneApp,
          aTrabajador: liq.aTrabajador,
          // Lo que se descuenta si retira este saldo a efectivo. Lo lee el retiro.
          alRetirar: liq.alRetirar,
          horasHastaInicio: Math.round(opts.horasHastaInicio * 100) / 100,
          actor: opts.actor,
        },
      });

      await Notification.create({
        recipientId: job.clientId,
        type: 'success',
        category: 'payment',
        title: 'Saldo a favor acreditado',
        message: mensajeDeCancelacion(liq, job.title),
        relatedModel: 'Job',
        relatedId: job.id,
        read: false,
      } as any).catch(() => { /* el saldo ya esta acreditado; el aviso es secundario */ });
    } catch (e: any) {
      // Lo peor que puede pasar: el trabajo cancelado y la plata sin mover.
      // No se traga: queda en el libro, se le avisa a administracion, y el
      // llamador lo devuelve para que el cliente lo vea.
      errores.push(`no se pudo acreditar el saldo del cliente: ${e?.message}`);
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

      // Cada trabajador por separado: que falle el credito de uno no puede
      // dejar sin cobrar a los demas ni cortar el resto de la liquidacion.
      try {
        await acreditarSaldo(String(workerId), porTrabajador, `Compensación por cancelación tardía de "${job.title}"`, {
          relatedModel: 'Job',
          relatedId: job.id,
          tipo: 'payment',
          metadata: { reason: 'job_cancelled_late_compensation', jobId: job.id, jobPrice },
        });
      } catch (e: any) {
        errores.push(`no se pudo acreditar la compensación del trabajador ${workerId}: ${e?.message}`);
        continue;
      }

      await Notification.create({
        recipientId: workerId,
        type: 'warning',
        category: 'payment',
        title: 'El cliente canceló el trabajo',
        message: `"${job.title}" fue cancelado con menos de ${POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES} horas de anticipación. Por el día que reservaste se te acreditaron ${$(porTrabajador)} a tu saldo. Podés pedir la transferencia desde tu balance.`,
        relatedModel: 'Job',
        relatedId: job.id,
        read: false,
      } as any).catch(() => { /* el saldo ya esta; el aviso es secundario */ });
      // Import perezoso: traer server/index.js arriba arrastra el servidor
      // entero (y rompe los tests que solo quieren liquidar).
      try {
        const { socketService } = await import('../index.js');
        socketService.notifyUser(workerId, 'job_cancelled_compensation', { jobId: job.id, amount: porTrabajador });
      } catch { /* sin socket en tests */ }
      if ((worker as any).email) {
        emailService.sendEmail({
          to: (worker as any).email,
          subject: `Cancelaron "${job.title}" — tenés una compensación`,
          html: `
            <h2>El cliente canceló el trabajo</h2>
            <p>Hola <strong>${(worker as any).name || ''}</strong>, el cliente canceló <strong>"${job.title}"</strong> con menos de ${POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES} horas de anticipación.</p>
            <p>Por el día que reservaste te corresponde la mitad del precio: <strong>${$(porTrabajador)}</strong>. Ya está en tu saldo de DOAPP y podés pedir la transferencia a tu cuenta desde la sección Balance.</p>
            <p style="color:#666;font-size:12px">Es lo que dicen los términos (punto 9.3). Si algo no te cierra, escribinos desde el centro de ayuda.</p>
          `,
        }).catch((e: any) => console.error('[cancelación] email al trabajador:', e?.message));
      }
    }
  }

  await logMoneyEvent({
    action: 'JOB_CANCELLED_SETTLED',
    actor: `${opts.actor.tipo === 'admin' ? 'admin' : 'user'}:${opts.actor.id}`,
    severity: errores.length > 0 ? 'high' : liq.aTrabajador > 0 ? 'medium' : 'low',
    description:
      `Publicación cancelada (${opts.actor.tipo}). Regla: ${liq.regla}. Salida: ${salida}.` +
      `${opts.motivo ? ` Motivo: ${opts.motivo}` : ''}` +
      `${errores.length > 0 ? ` PROBLEMAS: ${errores.join(' | ')}` : ''}`,
    userId: job.clientId,
    monto: jobPrice,
    moneda: 'ARS',
    metadata: {
      jobId: job.id, ...liq, salida, devueltoPorMp, errores,
      horasHastaInicio: Math.round(opts.horasHastaInicio * 100) / 100,
      trabajadores: selectedWorkers,
    },
  }).catch(() => {});

  // Plata que no se movio: tiene que verlo una persona hoy, no aparecer en la
  // auditoria de saldos dentro de una semana.
  if (errores.length > 0) {
    try {
      const { Op } = await import('sequelize');
      const admins = await User.findAll({ where: { role: { [Op.in]: ['admin', 'super_admin', 'owner'] } } });
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin.id,
          type: 'error',
          category: 'admin',
          title: 'Cancelación con plata sin mover',
          message: `Se canceló "${job.title}" pero algo falló: ${errores.join(' | ')}. Revisalo en el libro de dinero.`,
          relatedModel: 'Job',
          relatedId: job.id,
          sentVia: ['in_app'],
        } as any);
      }
    } catch { /* si ni esto se puede, queda el asiento del libro */ }
  }

  return { liq, trabajadores: selectedWorkers, porTrabajador, salida, devueltoPorMp, errores };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El mensaje para el cliente, con el desglose y sin eufemismos. Dice las dos
 * cosas que importan: cuanto tiene ahora como saldo (y que usarlo no cuesta),
 * y cuanto le quedaria si lo retira a efectivo.
 */
export function mensajeDeCancelacion(liq: LiquidacionCancelacion, titulo?: string): string {
  const h = POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES;
  const que = titulo ? `"${titulo}"` : 'la publicación';
  const retencion = liq.alRetirar.comision;
  const enEfectivo = Math.max(0, liq.aCliente - retencion);
  const retiro = retencion > 0
    ? ` Si en cambio lo retirás a tu cuenta, recibís ${$(enEfectivo)}: se descuentan ${$(retencion)} de la comisión por la revisión ya hecha.`
    : ' Retirarlo a tu cuenta no tiene costo.';
  const proc = liq.procesamientoNoVuelve > 0
    ? ` El costo de procesamiento del pago (${$(liq.procesamientoNoVuelve)}) no se devuelve: la pasarela ya lo cobró.`
    : '';
  const m: Record<LiquidacionCancelacion['regla'], string> = {
    antes_de_aprobar: `Se canceló ${que} antes de aprobarse. Tenés ${$(liq.aCliente)} de saldo a favor (precio y comisión): podés volver a publicar sin pagar de nuevo.${retiro}${proc}`,
    sin_trabajador: `Se canceló ${que} sin trabajador seleccionado. Tenés ${$(liq.aCliente)} de saldo a favor (precio y comisión): podés volver a publicar sin pagar de nuevo.${retiro}${proc}`,
    con_tiempo: `Se canceló ${que}. Tenés ${$(liq.aCliente)} de saldo a favor (el precio del trabajo; la comisión de publicación no se devuelve porque ya había un trabajador seleccionado).${retiro}${proc}`,
    tardia_con_trabajador: `Se canceló ${que} con menos de ${h} horas. La mitad del precio es para el trabajador que reservó el día (${$(liq.aTrabajador)}); la otra mitad, ${$(liq.aCliente)}, es tu saldo a favor. La comisión de publicación no se devuelve.${retiro}${proc}`,
  };
  return m[liq.regla];
}
