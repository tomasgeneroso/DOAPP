import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { MODULO_APROBACION_DE_PUBLICACIONES } from '../../shared/constants/modulos.js';
import { moduloActivo } from './moduleFlags.js';
import { debitarSaldo } from './quotePayment.js';
import { avisarPagoRecibido } from './avisoDePago.js';
import { DONDE_ES_ADMIN } from '../utils/admins.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import logger from './logger.js';

/**
 * Aumento de precio de un trabajo ya publicado, pagado por Mercado Pago.
 *
 * Qué pasaba: apenas el comprador volvía de pagar, el precio nuevo se aplicaba solo. Pero la regla de esta etapa es que
 * todo pago confirmado por Mercado Pago lo confirma un administrador (módulo «Aprobación de publicaciones pagadas»,
 * encendido por defecto), y el aumento era la única excepción.
 *
 * Cómo es ahora, con el módulo encendido:
 *  1. El comprador vuelve de pagar: el pago queda «pendiente de verificación» (con la marca `mercadopagoVerifiedAt` que
 *     certifica que Mercado Pago lo confirmó bien: monto exacto, moneda, sin cuotas ni cupón) y el trabajo sigue
 *     pausado con su aumento pendiente.
 *  2. Un administrador lo aprueba desde Pagos pendientes: el precio nuevo se aplica y el trabajo se reactiva.
 *  3. Si pasan `APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS` horas sin respuesta, el proceso programado lo aprueba solo,
 *     SIEMPRE QUE el pago haya sido efectuado correctamente (tenga esa marca). Un pago que quedó en revisión por
 *     no coincidir (monto distinto, en cuotas, con cupón) o que se pagó por transferencia sin verificar NO se aprueba
 *     solo: sigue esperando a una persona.
 * Con el módulo apagado, el aumento se aplica al volver el comprador, como antes.
 *
 * Todas las salidas (volver de pagar, admin, plazo vencido) pasan por `aplicarAumentoDePrecio`, que es la única que
 * toca el precio.
 */

export type OrigenDelAumento = 'retorno' | 'admin' | 'automatico';

export interface ResultadoAumento {
  aplicado: boolean;
  motivo?: string;
  precioAnterior?: number;
  precioNuevo?: number;
  trabajoId?: string;
}

const pesos = (n: number) => `${Number(n).toLocaleString('es-AR')}`;

/** ¿Este trabajo tiene un aumento de precio ya pagado que espera la revisión de un administrador? */
export async function aumentoPagadoEnRevision(job: { publicationPaymentId?: string | null }): Promise<boolean> {
  if (!job.publicationPaymentId) return false;
  const pago = await Payment.findOne({
    where: { id: job.publicationPaymentId, paymentType: 'budget_increase', status: 'pending_verification' },
    attributes: ['id'],
  });
  return Boolean(pago);
}

/**
 * Qué se le muestra al dueño de un trabajo con un cambio de precio a medias: si falta pagar o si ya pagó y espera.
 * La pantalla (web y celular) lo necesita para no ofrecer pagar dos veces lo que ya se pagó.
 */
export async function describirAumentoPendiente(job: any): Promise<{
  estado: 'sin_pagar' | 'pagado_en_revision';
  precioNuevo: number;
  montoAPagar: number;
  horasDeEspera: number;
} | null> {
  if (!job?.pendingNewPrice) return null;
  return {
    estado: (await aumentoPagadoEnRevision(job)) ? 'pagado_en_revision' : 'sin_pagar',
    precioNuevo: Number(job.pendingNewPrice),
    montoAPagar: Number(job.pendingPaymentAmount) || 0,
    horasDeEspera: POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS,
  };
}

/** Avisa a todos los administradores; si la lista saliera vacía, queda en el registro de errores. */
async function avisarAAdmins(titulo: string, mensaje: string, tipo: 'warning' | 'error', relatedModel: string, relatedId: string) {
  const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN } });
  if (admins.length === 0) {
    logger.error('payments', `Sin administradores a quienes avisar: ${titulo}`, { data: { relatedModel, relatedId, mensaje } });
  }
  for (const admin of admins) {
    await Notification.create({
      recipientId: admin.id,
      type: tipo,
      category: 'admin',
      title: titulo,
      message: mensaje,
      relatedModel,
      relatedId,
      sentVia: ['in_app'],
    } as any).catch((e: unknown) =>
      logger.error('payments', `No se pudo avisar a un administrador: ${titulo}`, {
        data: { adminId: String(admin.id), error: (e as Error)?.message },
      }),
    );
  }
}

/**
 * Aplica el precio nuevo de un trabajo con un aumento pendiente y lo reactiva. Es lo único que toca el precio.
 *
 * Idempotente: el trabajo se bloquea mientras se aplica y el aumento pendiente se borra al terminar, así que dos
 * llamadas juntas (volver de pagar y el plazo vencido, o dos administradores) lo aplican una sola vez.
 * La parte reservada del saldo a favor se descuenta acá, con asiento; si no alcanza (lo gastó mientras pagaba) el
 * aumento se aplica igual —la pasarela ya cobró— y se avisa a administración, que es quien puede reclamar la diferencia.
 */
export async function aplicarAumentoDePrecio(payment: Payment, origen: OrigenDelAumento, adminId?: string): Promise<ResultadoAumento> {
  const { sequelize } = await import('../config/database.js');
  let resultado: ResultadoAumento = { aplicado: false, motivo: 'No hay un aumento de precio pendiente para este pago.' };
  let trabajo: any = null;
  let saldoSinDebitar: { reservado: number; motivo: string } | null = null;

  await sequelize.transaction(async (t) => {
    const job: any = await Job.findOne({ where: { publicationPaymentId: payment.id }, lock: t.LOCK.UPDATE, transaction: t });
    if (!job || !job.pendingNewPrice) return;

    const precioAnterior = Number(job.price);
    const precioNuevo = Number(job.pendingNewPrice);
    const estadoAnterior = job.previousStatus || 'open';

    const reservado = Number(job.pendingBalanceDeduction) || 0;
    let saldoDebitado = 0;
    if (reservado > 0) {
      try {
        await debitarSaldo(String(job.clientId), reservado, `Aumento de precio de "${job.title}": parte cubierta con saldo`, {
          relatedModel: 'Job',
          relatedId: job.id,
          metadata: { oldPrice: precioAnterior, newPrice: precioNuevo, paymentId: payment.id, origen: 'aumento_de_precio' },
        });
        saldoDebitado = reservado;
      } catch (e: any) {
        saldoSinDebitar = { reservado, motivo: e?.message };
      }
    }

    // Arreglo NUEVO: Sequelize compara el jsonb por valor y un push sobre el mismo arreglo no se ve como cambio.
    const historial = [
      ...(job.priceHistory || []),
      {
        oldPrice: precioAnterior,
        newPrice: precioNuevo,
        reason: job.priceChangeReason || 'Aumento de presupuesto',
        changedAt: new Date(),
        paidFromBalance: saldoDebitado,
        paidViaGateway: Number(payment.amount) || 0,
        approvedBy: origen === 'admin' ? String(adminId || '') : origen === 'automatico' ? 'automatico' : 'retorno',
      },
    ];

    await job.update(
      {
        price: precioNuevo,
        priceChangedAt: new Date(),
        priceHistory: historial,
        pendingNewPrice: null,
        pendingPaymentAmount: 0,
        pendingBalanceDeduction: 0,
        previousStatus: null,
        status: estadoAnterior,
      } as any,
      { transaction: t },
    );

    trabajo = job;
    resultado = { aplicado: true, precioAnterior, precioNuevo, trabajoId: String(job.id) };
  });

  if (!resultado.aplicado || !trabajo) return resultado;

  if (saldoSinDebitar) {
    const { reservado, motivo } = saldoSinDebitar;
    logger.payment('ERROR', 'Aumento pagado pero el saldo reservado no se pudo debitar', {
      paymentId: String(payment.id),
      data: { jobId: String(trabajo.id), reservado, motivo },
      userId: String(trabajo.clientId),
    });
    await avisarAAdmins(
      'Saldo reservado que no se pudo debitar',
      `El aumento de "${trabajo.title}" se pagó, pero los ${pesos(reservado)} que iban a salir del saldo del cliente no se pudieron debitar: ${motivo}. El cliente debe esa diferencia.`,
      'error',
      'Job',
      String(trabajo.id),
    );
  }

  const horas = POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS;
  const encabezado =
    origen === 'admin' ? 'Tu pago fue aprobado. '
      : origen === 'automatico' ? `Pasaron ${horas} horas desde tu pago y se aprobó automáticamente. `
        : '';
  await avisarPagoRecibido({
    userId: trabajo.clientId,
    titulo: 'Presupuesto actualizado',
    mensaje: `${encabezado}El presupuesto de "${trabajo.title}" ha sido actualizado a ${pesos(resultado.precioNuevo!)} ARS. El trabajo ha sido reactivado.`,
    monto: Number(payment.amount),
    relatedModel: 'Job',
    relatedId: String(trabajo.id),
    actionText: 'Ver trabajo',
    ruta: `/jobs/${trabajo.id}`,
  });

  try {
    const { socketService } = await import('../index.js');
    socketService.notifyJobStatusChanged(trabajo.toJSON(), 'paused');
  } catch (e: any) {
    logger.silentError('payments', 'No se pudo avisar por socket el aumento de precio', e, { jobId: String(trabajo.id) });
  }

  return resultado;
}

/**
 * Deja el aumento pagado esperando a un administrador. Se llama cuando el comprador vuelve de pagar y el módulo de
 * aprobación está encendido. El pago pasa a «pendiente de verificación» CON la marca de que Mercado Pago lo confirmó
 * bien (es lo que habilita la aprobación automática pasado el plazo); el trabajo sigue pausado con su aumento pendiente.
 */
export async function dejarAumentoEnRevision(payment: Payment, job: Job): Promise<void> {
  await Payment.update(
    { status: 'pending_verification', mercadopagoVerifiedAt: new Date() } as any,
    { where: { id: payment.id, status: { [Op.in]: ['completed', 'held_escrow', 'processing', 'pending'] } } },
  );
  payment.status = 'pending_verification' as any;

  const horas = POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS;
  const nuevo = Number((job as any).pendingNewPrice);

  await avisarPagoRecibido({
    userId: payment.payerId,
    titulo: 'Recibimos el pago de tu aumento: está en revisión',
    mensaje:
      `Recibimos el pago del aumento de "${job.title}" a ${pesos(nuevo)} ARS. Un administrador lo revisa; ` +
      `si no lo revisa en ${horas} horas, se aprueba solo. Mientras tanto el trabajo sigue pausado y con el precio anterior.`,
    monto: Number(payment.amount),
    relatedModel: 'Job',
    relatedId: String(job.id),
    actionText: 'Ver trabajo',
    ruta: `/jobs/${job.id}`,
  });

  await avisarAAdmins(
    'Aumento de precio pagado para aprobar',
    `El cliente pagó ${pesos(Number(payment.amount))} ARS por subir "${job.title}" a ${pesos(nuevo)}. Aprobalo desde Pagos pendientes; ` +
      `si nadie lo revisa en ${horas} horas se aprueba solo.`,
    'warning',
    'Payment',
    String(payment.id),
  );
}

/**
 * Aprueba solos los aumentos pagados que esperan a un administrador hace más del plazo. Lo corre el proceso programado.
 *
 * Qué entra: pagos de aumento de un trabajo (sin contrato) en «pendiente de verificación» que tienen la marca
 * `mercadopagoVerifiedAt`, es decir que Mercado Pago confirmó bien. Qué NO entra: un pago que quedó en revisión por no
 * coincidir (la marca no se pone), uno por transferencia sin verificar, ni uno que ya falló al aplicarse.
 * Con el módulo de aprobación apagado no hay nada que esperar: se aprueban todos los pendientes.
 *
 * @returns cuántos aumentos se aprobaron.
 */
export async function aprobarAumentosVencidos(ahora: Date = new Date()): Promise<number> {
  const exigeAprobacion = await moduloActivo(MODULO_APROBACION_DE_PUBLICACIONES, true);
  const horas = exigeAprobacion ? POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS : 0;
  const limite = new Date(ahora.getTime() - horas * 60 * 60 * 1000);

  const candidatos = await Payment.findAll({
    where: {
      paymentType: 'budget_increase',
      contractId: null,
      status: 'pending_verification',
      mercadopagoVerifiedAt: { [Op.and]: [{ [Op.ne]: null }, { [Op.lte]: limite }] },
    } as any,
    order: [['mercadopagoVerifiedAt', 'ASC']],
    limit: 50,
  });

  let aprobados = 0;
  for (const pago of candidatos) {
    if ((pago.metadata as any)?.aumentoSinAplicar) continue;

    // Se "reclama" el pago con un UPDATE condicional al estado: si un administrador lo aprobó o rechazó en este
    // mismo momento, el proceso no lo pisa.
    const [reclamados] = await Payment.update(
      {
        status: 'completed',
        approvedAt: new Date(),
        adminNotes: `${pago.adminNotes || ''}\n[Automático] Aprobado a las ${horas} horas sin respuesta: el pago estaba confirmado por Mercado Pago.`.trim(),
      } as any,
      { where: { id: pago.id, status: 'pending_verification' } },
    );
    if (reclamados === 0) continue;

    const r = await aplicarAumentoDePrecio(pago, 'automatico');
    if (r.aplicado) {
      aprobados++;
      await logMoneyEvent({
        action: 'PRICE_INCREASE_AUTO_APPROVED',
        actor: 'cron:aprobarAumentosDePrecio',
        severity: 'medium',
        description: `Aumento de precio aprobado solo tras ${horas} horas sin respuesta del administrador.`,
        paymentId: String(pago.id),
        userId: String(pago.payerId),
        monto: Number(pago.amount),
        moneda: 'ARS',
        metadata: { trabajoId: r.trabajoId, precioAnterior: r.precioAnterior, precioNuevo: r.precioNuevo, horas },
      });
      continue;
    }

    // No había aumento que aplicar (el trabajo se canceló o se borró): la plata está cobrada y nada la respalda. Vuelve
    // a revisión humana y se marca para que el proceso no la reintente cada vez.
    await Payment.update(
      { status: 'pending_verification', metadata: { ...(pago.metadata || {}), aumentoSinAplicar: true } } as any,
      { where: { id: pago.id } },
    );
    await logMoneyEvent({
      action: 'PRICE_INCREASE_AUTO_NOT_APPLIED',
      actor: 'cron:aprobarAumentosDePrecio',
      severity: 'high',
      description: 'Venció el plazo de un aumento de precio pagado, pero el trabajo ya no tiene el aumento pendiente.',
      paymentId: String(pago.id),
      userId: String(pago.payerId),
      monto: Number(pago.amount),
      moneda: 'ARS',
      metadata: { motivo: r.motivo },
    });
    await avisarAAdmins(
      'Aumento de precio pagado que no se pudo aplicar',
      `Venció el plazo de un aumento pagado (${pesos(Number(pago.amount))} ARS), pero el trabajo ya no tiene el aumento pendiente. El dinero está cobrado: revisalo y, si corresponde, devolvelo.`,
      'error',
      'Payment',
      String(pago.id),
    );
  }

  if (aprobados > 0) console.log(`⏰ ${aprobados} aumento(s) de precio aprobados solos tras ${horas} horas`);
  return aprobados;
}
