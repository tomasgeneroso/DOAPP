import { Op } from 'sequelize';
import { Payment } from '../models/sql/Payment.model.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { logger } from './logger.js';

/**
 * Conciliacion: comparar lo que dice MercadoPago con lo que dice nuestra base.
 *
 * Es el ultimo control, y el unico que encuentra lo que ninguno de los
 * anteriores atrapo. Todos los demas controles previenen errores que sabemos
 * imaginar -- un pago doble, un contracargo ignorado, un admin excedido. La
 * conciliacion encuentra los que no: un webhook que nunca llego, un pago que MP
 * dio por aprobado y nosotros no, un monto que cambio despues de acreditarse.
 *
 * La regla de oro: MercadoPago es la verdad sobre lo que paso con la plata, y
 * nuestra base es la verdad sobre lo que la plataforma hizo al respecto.
 * Cuando difieren, el que se equivoco somos nosotros -- MP no se olvida de
 * cobrar. Por eso la conciliacion no corrige sola: marca y avisa. Corregir sin
 * entender que paso es como se convierte una diferencia en dos.
 */

export interface Discrepancia {
  paymentId: string;
  idMercadoPago: string | null;
  tipo:
    | 'aprobado_en_mp_pendiente_en_base'
    | 'monto_distinto'
    | 'rechazado_en_mp_activo_en_base'
    | 'reembolsado_en_mp_activo_en_base'
    | 'devuelto_distinto'
    | 'sin_respuesta_de_mp';
  nuestro: { estado: string; monto: number };
  deMp: { estado?: string; monto?: number };
  detalle: string;
}

export interface ResultadoConciliacion {
  revisados: number;
  discrepancias: Discrepancia[];
  desde: Date;
  hasta: Date;
}

/**
 * Concilia los pagos de una ventana de tiempo.
 *
 * Por defecto mira las ultimas 48 horas y no las ultimas 24: un webhook que se
 * pierde de noche se detecta al dia siguiente, y con una ventana de exactamente
 * un dia el pago cae justo en el borde y no lo ve ninguna corrida.
 */
export async function conciliarPagos(horas = 48): Promise<ResultadoConciliacion> {
  const desde = new Date(Date.now() - horas * 3_600_000);
  const hasta = new Date();

  const pagos = await Payment.findAll({
    where: {
      createdAt: { [Op.gte]: desde },
      // Los que ya terminaron en reembolso o cancelacion no tienen nada que
      // conciliar: su plata ya se movio y esta cerrada.
      status: { [Op.notIn]: ['refunded', 'cancelled'] },
    },
    limit: 1000,
  });

  const discrepancias: Discrepancia[] = [];
  const mercadoPagoService = (await import('./mercadopago.js')).default;

  for (const pago of pagos) {
    const idMp = (pago as any).mercadopagoPaymentId;

    // Sin id de pasarela no hay contra que comparar. No es una discrepancia: es
    // un pago que el usuario nunca llego a iniciar.
    if (!idMp) continue;

    let datosMp: any;
    try {
      datosMp = await mercadoPagoService.getPayment(idMp, 'mercadopago');
    } catch (e: any) {
      discrepancias.push({
        paymentId: String(pago.id),
        idMercadoPago: idMp,
        tipo: 'sin_respuesta_de_mp',
        nuestro: { estado: String(pago.status), monto: Number(pago.amount) },
        deMp: {},
        detalle: `No se pudo consultar el pago en MercadoPago: ${e.message}`,
      });
      continue;
    }

    const estadoMp = String(datosMp?.status || '');
    const montoMp = Number(datosMp?.transaction_amount) || 0;
    const nuestro = { estado: String(pago.status), monto: Number(pago.amount) };

    const aprobadoEnMp = estadoMp === 'approved' || estadoMp === 'accredited';
    const pendienteEnBase = ['pending', 'processing'].includes(nuestro.estado);

    // El caso que mas importa: MP cobro y nosotros no nos enteramos. Es el
    // webhook perdido, y significa que hay un cliente que pago y no tiene su
    // contrato.
    if (aprobadoEnMp && pendienteEnBase) {
      discrepancias.push({
        paymentId: String(pago.id),
        idMercadoPago: idMp,
        tipo: 'aprobado_en_mp_pendiente_en_base',
        nuestro,
        deMp: { estado: estadoMp, monto: montoMp },
        detalle:
          'MercadoPago cobró este pago pero en la plataforma sigue pendiente. ' +
          'Probablemente se perdió el webhook: hay alguien que pagó y no recibió lo que compró.',
      });
      continue;
    }

    if (aprobadoEnMp && montoMp > 0 && Math.abs(montoMp - nuestro.monto) > 0.01) {
      discrepancias.push({
        paymentId: String(pago.id),
        idMercadoPago: idMp,
        tipo: 'monto_distinto',
        nuestro,
        deMp: { estado: estadoMp, monto: montoMp },
        detalle: `Nosotros registramos $${nuestro.monto} y MercadoPago informa $${montoMp}.`,
      });
      continue;
    }

    if ((estadoMp === 'rejected' || estadoMp === 'cancelled') &&
        !['failed', 'cancelled'].includes(nuestro.estado)) {
      discrepancias.push({
        paymentId: String(pago.id),
        idMercadoPago: idMp,
        tipo: 'rechazado_en_mp_activo_en_base',
        nuestro,
        deMp: { estado: estadoMp, monto: montoMp },
        detalle:
          'MercadoPago rechazó el pago pero en la plataforma sigue activo. ' +
          'Puede haber un contrato vivo sin plata detrás.',
      });
      continue;
    }

    if (estadoMp === 'refunded' && nuestro.estado !== 'refunded') {
      discrepancias.push({
        paymentId: String(pago.id),
        idMercadoPago: idMp,
        tipo: 'reembolsado_en_mp_activo_en_base',
        nuestro,
        deMp: { estado: estadoMp, monto: montoMp },
        detalle: 'MercadoPago devolvió el dinero pero la plataforma no lo registró.',
      });
      continue;
    }

    /**
     * Devoluciones hechas por fuera de la app.
     *
     * Es el agujero que ningun control previo puede tapar: alguien entra al
     * panel de MercadoPago y devuelve plata sin pasar por este codigo. Nuestro
     * acumulado queda corto, y la app sigue creyendo que hay saldo para
     * devolver cuando ya no queda.
     *
     * Compararlo con lo que informa MercadoPago es la unica forma de verlo, y
     * hay que verlo pronto: cuanto mas tarde, mas dificil es reconstruir quien
     * lo hizo y por que.
     */
    const devueltoMp = Number(datosMp?.transaction_amount_refunded) || 0;
    const devueltoNuestro = Number((pago as any).refundedAmount) || 0;

    if (Math.abs(devueltoMp - devueltoNuestro) > 0.01) {
      discrepancias.push({
        paymentId: String(pago.id),
        idMercadoPago: idMp,
        tipo: 'devuelto_distinto',
        nuestro: { ...nuestro, devuelto: devueltoNuestro } as any,
        deMp: { estado: estadoMp, monto: montoMp, devuelto: devueltoMp } as any,
        detalle:
          `MercadoPago informa $${devueltoMp} devueltos y la plataforma registró $${devueltoNuestro}. ` +
          (devueltoMp > devueltoNuestro
            ? 'Alguien devolvió desde el panel de MercadoPago sin pasar por la app.'
            : 'La app registró una devolución que MercadoPago no confirma.'),
      });
    }
  }

  return { revisados: pagos.length, discrepancias, desde, hasta };
}

/**
 * Corre la conciliacion y deja asentado el resultado.
 *
 * Se registra tambien cuando no hay diferencias. Un registro que solo aparece
 * cuando algo falla no permite distinguir "todo bien" de "la conciliacion no
 * corrio", y esa distincion es justamente la que importa el dia que algo se
 * rompe en silencio.
 */
export async function conciliarYRegistrar(motivo: string, horas = 48): Promise<ResultadoConciliacion> {
  const r = await conciliarPagos(horas);

  if (r.discrepancias.length === 0) {
    logger.info('reconciliation', `Conciliación (${motivo}): ${r.revisados} pagos revisados, sin diferencias.`);
    await logMoneyEvent({
      action: 'RECONCILIATION_OK',
      actor: `reconciliacion:${motivo}`,
      severity: 'low',
      description: `Conciliación sin diferencias: ${r.revisados} pagos revisados.`,
      metadata: { motivo, revisados: r.revisados, desde: r.desde, hasta: r.hasta },
    });
    return r;
  }

  logger.error('reconciliation', `Conciliación (${motivo}): ${r.discrepancias.length} diferencias`, {
    data: { discrepancias: r.discrepancias },
  });

  await logMoneyEvent({
    action: 'RECONCILIATION_MISMATCH',
    actor: `reconciliacion:${motivo}`,
    severity: 'critical',
    description:
      `Se encontraron ${r.discrepancias.length} diferencias entre MercadoPago y la plataforma ` +
      `sobre ${r.revisados} pagos revisados.`,
    metadata: { motivo, revisados: r.revisados, discrepancias: r.discrepancias },
  });

  // Aviso a administración. Va por notificación y no sólo al log porque una
  // diferencia de plata que nadie mira deja de ser un hallazgo y pasa a ser
  // una pérdida.
  const { User } = await import('../models/sql/User.model.js');
  const { Notification } = await import('../models/sql/Notification.model.js');
  const admins = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'super_admin', 'owner'] } },
  });

  const resumen = r.discrepancias.slice(0, 3).map((d) => d.detalle).join(' | ');

  for (const admin of admins) {
    await Notification.create({
      recipientId: admin.id,
      type: 'error',
      category: 'admin',
      title: `Conciliación: ${r.discrepancias.length} diferencias`,
      message:
        `La conciliación (${motivo}) encontró diferencias entre MercadoPago y la plataforma. ` +
        resumen +
        (r.discrepancias.length > 3 ? ` (y ${r.discrepancias.length - 3} más)` : ''),
      relatedModel: 'System',
      sentVia: ['in_app'],
    } as any);
  }

  return r;
}

/**
 * Conciliacion disparada por un movimiento puntual.
 *
 * Ademas de la corrida diaria, conviene conciliar apenas pasa algo que mueve
 * plata de forma no habitual: un contracargo, una disputa, un reembolso. En
 * esos momentos la diferencia entre lo que cree MP y lo que cree la plataforma
 * es mas probable, y encontrarla en el momento -- con el caso fresco y la
 * persona todavia al telefono -- vale mucho mas que encontrarla mañana.
 *
 * Se limita a una ventana corta porque no hace falta revisar todo: lo que
 * interesa es lo que acaba de pasar.
 */
export async function conciliarPorEvento(evento: string): Promise<void> {
  try {
    await conciliarYRegistrar(`evento:${evento}`, 6);
  } catch (e: any) {
    // Nunca puede tumbar el movimiento que la disparó: la conciliación es un
    // control posterior, no parte de la operación.
    logger.error('reconciliation', `Falló la conciliación por evento ${evento}: ${e.message}`);
  }
}

/**
 * Corrida diaria.
 *
 * A las 4 de la mañana: despues de que cerro el dia y antes de que empiece el
 * siguiente, asi que las diferencias estan sobre un dia completo y quien llega
 * a la mañana ya las tiene esperando.
 */
export function startReconciliation(): void {
  const UNA_HORA = 60 * 60 * 1000;

  const correrSiEsHora = () => {
    if (new Date().getHours() === 4) {
      conciliarYRegistrar('diaria', 48).catch((e) =>
        logger.error('reconciliation', `Falló la conciliación diaria: ${e.message}`),
      );
    }
  };

  setInterval(correrSiEsHora, UNA_HORA);
}
