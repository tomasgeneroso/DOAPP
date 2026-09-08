import express from 'express';
import { Payment } from "../models/sql/Payment.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Membership } from "../models/sql/Membership.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import mercadopagoService from '../services/mercadopago.js';
import membershipService from '../services/membershipService.js';
import emailService from '../services/email.js';
import logger from '../services/logger.js';
import { Op } from 'sequelize';
import crypto from 'crypto';

const router = express.Router();

/**
 * Verifica la firma `x-signature` de MercadoPago (HMAC-SHA256).
 * Si MERCADOPAGO_WEBHOOK_SECRET no está configurado, se omite (no rompe el flujo
 * actual; configurar el secret en el panel de MP activa la verificación).
 * Manifest (doc MP): `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
function verifyMpSignature(req: express.Request): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // no configurado → no verificar

  const sigHeader = req.headers['x-signature'] as string | undefined;
  const requestId = req.headers['x-request-id'] as string | undefined;
  if (!sigHeader) return false;

  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(',')) {
    const [k, v] = kv.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  let dataId = (req.query['data.id'] ?? (req.body?.data?.id)) as string | undefined;
  if (dataId) dataId = String(dataId).toLowerCase();

  const manifest = `id:${dataId ?? ''};request-id:${requestId ?? ''};ts:${ts};`;
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/mercadopago
 * Webhook para recibir notificaciones de MercadoPago
 */
router.post('/mercadopago', async (req, res) => {
  const startTime = Date.now();

  try {
    const { type, data, action } = req.body;
    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for'] as string) || 'unknown';

    // Log webhook recibido
    logger.webhook('mercadopago', type || action || 'unknown', 'Webhook received', {
      data: { type, action, dataId: data?.id },
      ip
    });

    // Verificar firma (si MERCADOPAGO_WEBHOOK_SECRET está configurado)
    if (!verifyMpSignature(req)) {
      logger.webhook('mercadopago', 'invalid_signature', 'Webhook signature verification failed', { ip });
      res.status(401).send('invalid signature');
      return;
    }

    // Responder inmediatamente a MercadoPago (evitar timeout)
    res.status(200).send('OK');

    // Procesar el webhook de forma asíncrona
    if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
      await handlePaymentWebhook(data, ip);
    } else if (type === 'subscription' || action?.startsWith('subscription')) {
      await handleSubscriptionWebhook(data, action, ip);
    } else if (type === 'chargebacks' || type === 'chargeback' || action?.startsWith('chargeback')) {
      await handleChargebackWebhook(data, type || action, ip);
    } else if (type === 'claim' || type === 'claims' || action?.startsWith('claim')) {
      await handleClaimWebhook(data, ip);
    } else if (
      type === 'fraud_alert' ||
      type === 'fraud_alerts' ||
      action?.startsWith('fraud')
    ) {
      await handleFraudAlertWebhook(data, ip);
    } else if (
      type === 'order' ||
      type === 'merchant_order' ||
      action?.startsWith('order') ||
      action?.startsWith('merchant_order')
    ) {
      await handleOrderWebhook(data, type || action, ip);
    } else {
      // Un evento que no sabemos atender se registra en vez de descartarse.
      // Antes caian en silencio, que es lo mismo que no recibirlos: si alguna
      // vez llega algo que importa, esto es lo unico que lo hace visible.
      logger.webhook('mercadopago', type || action || 'desconocido', 'Evento no manejado', {
        data: { type, action, dataId: data?.id },
        ip,
      });
    }

    // Log tiempo de procesamiento
    const processingTime = Date.now() - startTime;
    logger.webhook('mercadopago', type || action || 'unknown', `Webhook processed in ${processingTime}ms`, {
      data: { processingTime, dataId: data?.id }
    });
  } catch (error: any) {
    logger.error('webhooks', 'Error processing MercadoPago webhook', {
      data: { error: error.message, stack: error.stack },
      ip: req.ip
    });
    // Ya respondimos 200, solo loguear el error
  }
});

/**
 * Contracargos y reclamos.
 *
 * Es la notificacion mas cara de ignorar de todas. En un contracargo el banco
 * le devuelve el dinero al cliente y despues nos lo debita a nosotros: si entre
 * medio le pagamos al trabajador, la plata sale dos veces y la segunda no
 * vuelve. La liberacion automatica del escrow corre sola cada hora, asi que la
 * ventana no depende de que alguien este mirando.
 *
 * Lo unico que hace falta hacer rapido es congelar. Resolverlo es trabajo
 * humano y lleva dias; frenar el pago tiene que pasar en segundos.
 *
 * El expediente de evidencia se arma acá y no cuando el administrador entra a
 * mirar, porque se arma con el estado del contrato AHORA. Dentro de tres dias
 * los mensajes, las fotos y las marcas diarias pueden haber cambiado, y lo que
 * hay que presentarle a MercadoPago es lo que era cierto cuando se reclamo.
 */
async function handleChargebackWebhook(data: any, tipo: string, ip: string) {
  try {
    const idExterno = data?.id;
    logger.webhook('mercadopago', tipo, `Contracargo o reclamo recibido: ${idExterno}`, {
      data: { id: idExterno },
      ip,
    });

    /**
     * Se consulta el caso para saber hasta cuando se puede presentar descargo.
     *
     * MercadoPago no da un plazo fijo de X dias: devuelve una FECHA LIMITE en
     * el detalle del caso, distinta segun la marca de la tarjeta. Sin
     * consultarla no sabemos cuanto tiempo hay, y un contracargo puede tardar
     * hasta seis meses en resolverse con la plata retenida mientras tanto.
     *
     * Se consulta acá y no cuando el administrador abre el caso porque la
     * notificacion es el unico momento garantizado: si nadie entra a mirar en
     * tres dias, el plazo corre igual.
     */
    let detalleCaso: any = null;
    let fechaLimite: string | null = null;

    if (idExterno) {
      try {
        const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
        const r = await fetch(`https://api.mercadopago.com/v1/chargebacks/${idExterno}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          detalleCaso = await r.json();
          fechaLimite = detalleCaso?.documentation_required_deadline || detalleCaso?.date_documentation_deadline || null;
        }
      } catch (e: any) {
        // Que falle la consulta no puede impedir el congelamiento, que es lo
        // urgente. Se sigue sin el plazo y se avisa igual.
        logger.error('webhooks', `No se pudo consultar el contracargo ${idExterno}: ${e.message}`);
      }
    }

    // La notificacion trae el id del contracargo, no el del pago. Se busca por
    // los tres campos posibles porque el formato cambia segun el tipo de evento,
    // y el detalle del caso lo trae cuando la notificacion no.
    const idPago =
      data?.payment_id || data?.payment?.id || data?.resource?.payment_id || detalleCaso?.payment_id;

    const pago = idPago
      ? await Payment.findOne({ where: { mercadopagoPaymentId: String(idPago) } })
      : null;

    if (!pago) {
      // Sin pago identificado no se puede congelar nada, pero tampoco se puede
      // dejar pasar: alguien tiene que buscarlo a mano en el panel de MP.
      logger.error('webhooks', 'Contracargo sin pago identificable', {
        data: { id: idExterno, idPago, tipo },
      });
      await avisarAdmins(
        'Contracargo sin pago identificado',
        `Llegó un ${tipo} (id ${idExterno}) que no pudo asociarse a ningún pago. Hay que buscarlo manualmente en el panel de MercadoPago.`,
        'Payment',
        null,
      );
      return;
    }

    pago.status = 'disputed';
    await pago.save();

    let evidenciaLista = false;

    if (pago.contractId) {
      const contrato = await Contract.findByPk(pago.contractId);
      if (contrato) {
        // Congelar es lo urgente. Con el contrato en 'disputed', reserve() en
        // paymentActions rechaza cualquier PAYOUT sobre él.
        contrato.status = 'disputed';
        (contrato as any).paymentStatus = 'disputed';
        await contrato.save();

        try {
          const { buildContractEvidence } = await import('../services/contractEvidence.js');
          evidenciaLista = !!(await buildContractEvidence(String(pago.contractId)));
        } catch (e: any) {
          // Que falle armar el expediente no puede impedir el congelamiento,
          // que ya ocurrió arriba.
          logger.error('webhooks', `No se pudo armar la evidencia del contracargo: ${e.message}`, {
            data: { contractId: pago.contractId },
          });
        }
      }
    }

    // Queda asentado con fecha, monto y cuentas. Cuando esto se discuta -- y un
    // contracargo se discute -- lo que hay que poder mostrar es qué se hizo,
    // cuándo y sobre qué plata.
    const { logMoneyEvent } = await import('../utils/auditLog.js');
    await logMoneyEvent({
      action: 'CHARGEBACK_RECEIVED',
      actor: 'webhook:mercadopago',
      severity: 'critical',
      description: `Se recibió un ${tipo} y se congeló el pago. El contrato quedó en disputa.`,
      contractId: pago.contractId ? String(pago.contractId) : undefined,
      paymentId: String(pago.id),
      userId: pago.payerId ? String(pago.payerId) : undefined,
      monto: Number(pago.amount),
      moneda: String(pago.currency || 'ARS'),
      cuentas: {
        pagadorId: pago.payerId,
        destinatarioId: pago.recipientId,
        idPagoMercadoPago: pago.mercadopagoPaymentId,
        medioDePago: pago.paymentMethodId,
        ultimos4: pago.cardLastFourDigits,
        marca: pago.cardBrand,
      },
      metadata: { idExterno, tipo, evidenciaGenerada: evidenciaLista, fechaLimite, detalleCaso },
    });

    // Un contracargo es exactamente el momento donde MercadoPago y la
    // plataforma se pueden desincronizar, así que se concilia en el acto en vez
    // de esperar a la corrida de la madrugada.
    const { conciliarPorEvento } = await import('../services/reconciliation.js');
    void conciliarPorEvento('contracargo');

    await avisarAdmins(
      'Contracargo recibido: pago congelado',
      `Se recibió un ${tipo} sobre un pago de $${Number(pago.amount).toLocaleString('es-AR')}. ` +
        `El contrato quedó en disputa y no se puede liberar el pago al trabajador. ` +
        (evidenciaLista
          ? 'El expediente de evidencia se generó con el estado actual del contrato.'
          : 'No se pudo generar el expediente automáticamente: revisalo a mano.') +
        // El plazo va en el aviso y no sólo en el registro: es el dato que
        // decide si hay que dejar todo y responder hoy, o si se puede mañana.
        (fechaLimite
          ? ` Tenés tiempo hasta el ${new Date(fechaLimite).toLocaleString('es-AR')} para presentar la documentación.`
          : ' MercadoPago no informó una fecha límite en el caso: entrá al panel para verla.'),
      'Payment',
      pago.id,
    );
  } catch (error: any) {
    logger.error('webhooks', `Error manejando contracargo: ${error.message}`, {
      data: { stack: error.stack },
    });
  }
}

/**
 * Reclamos.
 *
 * Un reclamo es el paso previo al contracargo: el cliente se queja ante
 * MercadoPago pero todavia no fue al banco. Es la ventana en la que todavia se
 * puede resolver hablando, y por eso llega separado del contracargo.
 *
 * Congela igual. La diferencia con un contracargo no es la urgencia -- si el
 * cliente esta reclamando, liberarle el pago al trabajador en el medio es
 * exactamente lo que no hay que hacer -- sino que acá todavia hay margen para
 * responder antes de perder la plata.
 */
async function handleClaimWebhook(data: any, ip: string) {
  const idPago = data?.payment_id || data?.payment?.id || data?.resource?.payment_id;
  logger.webhook('mercadopago', 'claim', `Reclamo recibido: ${data?.id}`, {
    data: { id: data?.id, idPago },
    ip,
  });

  // Se reusa la ruta del contracargo: congelar, armar evidencia y avisar es lo
  // mismo. Duplicarlo haria que un arreglo en uno no llegue al otro.
  await handleChargebackWebhook(data, 'reclamo', ip);
}

/**
 * Alertas de fraude.
 *
 * MercadoPago avisa que un pago tiene señales de fraude. Se retiene el pago al
 * trabajador hasta que un administrador mire el caso.
 *
 * La retencion es distinta de una disputa y por eso vive en su propio campo. En
 * una disputa hay alguien reclamando; acá hay una sospecha automatica y nadie
 * acuso a nadie. Marcar el contrato como 'disputed' le diria al trabajador que
 * el cliente lo denuncio, que es falso.
 *
 * Se retiene y no solo se avisa porque la liberacion automatica del escrow corre
 * a las dos horas: un aviso que llega a las tres de la mañana y se lee a las
 * nueve llega despues de que la plata salio. Levantar la retencion es barato --
 * un clic de un administrador -- y perder la plata no tiene vuelta.
 *
 * Lo que NO se hace es penalizar a nadie ni contarle al cliente que hay una
 * sospecha. Una alerta no es una acusacion, y el falso positivo le arruina el
 * trabajo a una persona honesta.
 */
async function handleFraudAlertWebhook(data: any, ip: string) {
  try {
    const idPago = data?.payment_id || data?.payment?.id || data?.resource?.payment_id;
    logger.webhook('mercadopago', 'fraud_alert', `Alerta de fraude: ${data?.id}`, {
      data: { id: data?.id, idPago },
      ip,
    });

    const pago = idPago
      ? await Payment.findOne({ where: { mercadopagoPaymentId: String(idPago) } })
      : null;

    // Se retiene el pago. El contrato NO pasa a 'disputed': nadie reclamó.
    let retenido = false;
    if (pago?.contractId) {
      const contrato = await Contract.findByPk(pago.contractId);
      if (contrato && !(contrato as any).fraudHoldAt) {
        (contrato as any).fraudHoldAt = new Date();
        (contrato as any).fraudHoldReason =
          `Alerta de fraude de MercadoPago (id ${data?.id || 'sin id'})`;
        (contrato as any).fraudHoldClearedAt = null;
        await contrato.save();
        retenido = true;
      }
    }

    const { logMoneyEvent } = await import('../utils/auditLog.js');
    await logMoneyEvent({
      action: 'FRAUD_ALERT_RECEIVED',
      actor: 'webhook:mercadopago',
      severity: 'critical',
      description:
        `MercadoPago reportó una señal de fraude sobre el pago ${idPago || '(sin identificar)'}. ` +
        (retenido ? 'Se retuvo el pago al trabajador.' : 'No se pudo retener: sin contrato asociado.'),
      contractId: pago?.contractId ? String(pago.contractId) : undefined,
      paymentId: pago ? String(pago.id) : undefined,
      userId: pago?.payerId ? String(pago.payerId) : undefined,
      monto: pago ? Number(pago.amount) : undefined,
      cuentas: pago
        ? {
            pagadorId: pago.payerId,
            destinatarioId: pago.recipientId,
            idPagoMercadoPago: pago.mercadopagoPaymentId,
            medioDePago: pago.paymentMethodId,
            ultimos4: pago.cardLastFourDigits,
          }
        : undefined,
      metadata: { alertaId: data?.id, idPagoMp: idPago, retenido, datos: data },
    });

    await avisarAdmins(
      'Alerta de fraude: pago retenido',
      pago
        ? `MercadoPago reportó una señal de fraude sobre un pago de $${Number(pago.amount).toLocaleString('es-AR')}. ` +
            (retenido
              ? 'El pago al trabajador quedó retenido hasta que alguien revise el caso. Si es un falso positivo, levantá la retención desde el contrato.'
              : 'No se pudo retener automáticamente porque no hay contrato asociado: revisalo a mano.')
        : `Llegó una alerta de fraude (id ${data?.id}) que no pudo asociarse a ningún pago. Buscala en el panel de MercadoPago.`,
      pago ? 'Payment' : 'System',
      pago ? String(pago.id) : null,
    );
  } catch (error: any) {
    logger.error('webhooks', `Error manejando alerta de fraude: ${error.message}`, {
      data: { stack: error.stack },
    });
  }
}

/**
 * Ordenes (Order API y merchant_order).
 *
 * Una orden agrupa uno o varios pagos de la misma compra. Hoy DOAPP cobra de a
 * un pago por vez, asi que la orden no agrega informacion nueva: el pago que
 * contiene ya llega por su propio evento y es el que crea el contrato.
 *
 * Se atiende igual, y no por completitud. Cuando una orden cierra pero su pago
 * no llego -- porque el webhook de pago se perdio, que pasa -- esto es lo unico
 * que lo hace visible. Reprocesar el pago desde acá cierra ese agujero sin
 * duplicar nada: handlePaymentWebhook es idempotente sobre un pago ya aprobado.
 */
async function handleOrderWebhook(data: any, tipo: string, ip: string) {
  try {
    const idOrden = data?.id;
    logger.webhook('mercadopago', tipo, `Orden recibida: ${idOrden}`, {
      data: { id: idOrden },
      ip,
    });

    // Los pagos de la orden vienen embebidos o hay que ir a buscarlos. Se
    // toman los que ya vengan: pedir la orden completa a la API es una llamada
    // mas que casi nunca aporta.
    const pagos: any[] = data?.payments || data?.transactions?.payments || [];

    if (pagos.length === 0) {
      logger.webhook('mercadopago', tipo, 'Orden sin pagos: nada que hacer', {
        data: { id: idOrden },
      });
      return;
    }

    for (const p of pagos) {
      const estado = p?.status;
      if (estado !== 'approved' && estado !== 'accredited') continue;

      const yaRegistrado = await Payment.findOne({
        where: { mercadopagoPaymentId: String(p.id) },
      });

      // Si ya lo tenemos con el pago acreditado, el evento de pago hizo su
      // trabajo y no hay nada que rehacer.
      if (yaRegistrado && yaRegistrado.status !== 'pending') continue;

      logger.payment('WEBHOOK_PROCESS', `Pago recuperado desde la orden ${idOrden}`, {
        paymentId: String(p.id),
      });

      // Se procesa por el camino normal: es idempotente y evita tener dos
      // implementaciones de lo mismo que puedan divergir.
      await handlePaymentWebhook({ id: p.id }, ip);
    }
  } catch (error: any) {
    logger.error('webhooks', `Error manejando la orden: ${error.message}`, {
      data: { stack: error.stack },
    });
  }
}

/** Aviso a todos los administradores. Se repite lo suficiente como para existir. */
async function avisarAdmins(
  title: string,
  message: string,
  relatedModel: string,
  relatedId: string | null,
) {
  const admins = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'super_admin', 'owner'] } },
  });
  for (const admin of admins) {
    await Notification.create({
      recipientId: admin.id,
      type: 'error',
      category: 'admin',
      title,
      message,
      relatedModel,
      relatedId,
      sentVia: ['in_app'],
    } as any);
  }
}

/**
 * Manejar webhook de pago
 */
async function handlePaymentWebhook(data: any, ip: string) {
  try {
    const paymentId = data.id;

    logger.payment('WEBHOOK_PROCESS', `Processing payment webhook for ID: ${paymentId}`, {
      paymentId: paymentId?.toString()
    });

    const mpPaymentData = await mercadopagoService.getPayment(paymentId, 'mercadopago');

    const { status, metadata, transaction_amount, currency_id } = mpPaymentData;
    const external_reference = metadata?.external_reference;
    const status_detail = mpPaymentData.status_detail || status;

    // Extract payment method details
    const paymentMethodInfo = {
      payment_type_id: mpPaymentData.payment_type_id,
      payment_method_id: mpPaymentData.payment_method_id,
      card_last_four_digits: mpPaymentData.card_last_four_digits,
      card_brand: mpPaymentData.card_brand,
    };

    logger.payment('WEBHOOK_DATA', `MercadoPago payment data received`, {
      paymentId: paymentId?.toString(),
      status,
      data: { external_reference, amount: transaction_amount, currency: currency_id, ...paymentMethodInfo }
    });

    // Buscar el pago en nuestra base de datos
    const dbPayment = await Payment.findOne({
      where: {
        [Op.or]: [
          { mercadopagoPaymentId: paymentId?.toString() },
          { contractId: external_reference },
        ],
      },
    });

    // Si no se encuentra por contractId, buscar por metadata.job_id
    let foundPayment = dbPayment;

    // Un pago de cotización todavía no tiene contrato, así que ni
    // mercadopagoPaymentId ni contractId lo encuentran. Por eso su preferencia
    // lleva el id del registro en la metadata: es el único puente disponible
    // antes de que el contrato exista.
    if (!foundPayment && metadata?.payment_id) {
      foundPayment = await Payment.findByPk(metadata.payment_id);
    }
    if (!foundPayment && metadata?.job_id) {
      const { Job } = await import('../models/sql/Job.model.js');
      const job = await Job.findByPk(metadata.job_id);
      if (job && job.publicationPaymentId) {
        foundPayment = await Payment.findByPk(job.publicationPaymentId);
      }
    }

    if (!foundPayment) {
      logger.warn('webhooks', `Payment not found in database: ${paymentId}`, {
        data: { mpPaymentId: paymentId, external_reference }
      });
      return;
    }

    // Actualizar estado del pago
    const previousStatus = foundPayment.status;
    foundPayment.mercadopagoPaymentId = paymentId?.toString();
    foundPayment.mercadopagoStatus = status;
    foundPayment.mercadopagoStatusDetail = status_detail;

    // Save payment method details
    foundPayment.paymentTypeId = paymentMethodInfo.payment_type_id;
    foundPayment.paymentMethodId = paymentMethodInfo.payment_method_id;
    foundPayment.cardLastFourDigits = paymentMethodInfo.card_last_four_digits ?? undefined;
    foundPayment.cardBrand = paymentMethodInfo.card_brand ?? undefined;

    if (status === 'succeeded' || status === 'approved') {
      /**
       * El monto que informa MercadoPago tiene que ser el que esperábamos.
       *
       * Hasta acá `transaction_amount` sólo se logueaba. Confiar en que
       * coincide es confiar en que nada pudo alterar la preferencia entre que
       * se creó y que se pagó: distinta moneda, un importe editado, un webhook
       * que apunta al pago equivocado. Ninguna de esas es probable; todas
       * terminan con un contrato creado por menos plata de la que dice.
       *
       * Se compara con un centavo de tolerancia, no exacto: los importes van y
       * vuelven como decimales y un redondeo no puede frenar un pago legítimo.
       */
      const esperado = Number(foundPayment.amount) || 0;
      const recibido = Number(transaction_amount) || 0;
      const monedaOk = !currency_id || String(currency_id) === String(foundPayment.currency);

      if (recibido > 0 && (Math.abs(recibido - esperado) > 0.01 || !monedaOk)) {
        foundPayment.status = 'pending_verification';
        await foundPayment.save();

        logger.payment('ERROR', 'Monto o moneda del webhook no coinciden con el pago esperado', {
          paymentId: foundPayment.id?.toString(),
          data: { esperado, recibido, moneda: currency_id, monedaEsperada: foundPayment.currency },
          userId: foundPayment.payerId?.toString(),
        });

        const admins = await User.findAll({
          where: { role: { [Op.in]: ['admin', 'super_admin', 'owner'] } },
        });
        for (const admin of admins) {
          await Notification.create({
            recipientId: admin.id,
            type: 'error',
            category: 'admin',
            title: 'Pago con monto inesperado',
            message:
              `Se esperaban ${foundPayment.currency} ${esperado} y MercadoPago informó ${currency_id} ${recibido}. ` +
              'El pago quedó pendiente de verificación y no se ejecutó ninguna acción.',
            relatedModel: 'Payment',
            relatedId: foundPayment.id,
            sentVia: ['in_app'],
          } as any);
        }
        return;
      }

      await handleApprovedPayment(foundPayment, metadata);
    } else if (status === 'rejected' || status === 'cancelled') {
      await handleRejectedPayment(foundPayment);
    } else if (status === 'refunded') {
      await handleRefundedPayment(foundPayment);
    } else if (status === 'pending' || status === 'in_process') {
      foundPayment.status = 'processing';
      await foundPayment.save();

      logger.payment('PENDING', `Payment pending: ${paymentId}`, {
        paymentId: foundPayment.id?.toString(),
        status: 'processing'
      });
    }

    logger.payment('STATUS_CHANGE', `Payment status changed: ${previousStatus} → ${foundPayment.status}`, {
      paymentId: foundPayment.id?.toString(),
      status: foundPayment.status,
      data: { previousStatus, newStatus: foundPayment.status, mpStatus: status }
    });

    // Si es un pago de membresía
    if (metadata?.type === 'membership') {
      await handleMembershipPayment(metadata.user_id, paymentId, status);
    }
  } catch (error: any) {
    logger.error('webhooks', `Error handling payment webhook: ${error.message}`, {
      data: { error: error.message, stack: error.stack, paymentId: data?.id }
    });
  }
}

/**
 * Manejar pago aprobado
 * IMPORTANTE: Todos los pagos requieren verificación manual del admin
 */
async function handleApprovedPayment(payment: any, metadata: any) {
  const { Job } = await import('../models/sql/Job.model.js');

  // ============================================
  // ACEPTACIÓN DE COTIZACIÓN
  // ============================================
  // Acá se selecciona al trabajador, y recién acá: la plata ya está acreditada.
  // El contrato que se crea sigue pasando por la aprobación del administrador
  // como cualquier otro, así que esto no saltea ningún control -- sólo asegura
  // que nadie quede comprometido antes de que el pago exista.
  const infoCotizacion = payment.metadata?.tipo === 'aceptacion_cotizacion' ? payment.metadata : null;

  if (infoCotizacion) {
    payment.status = 'pending_verification';
    payment.mercadopagoVerifiedAt = new Date();
    await payment.save();

    const { confirmarPagoDeCotizacion } = await import('../services/quotePayment.js');
    const r = await confirmarPagoDeCotizacion(
      infoCotizacion.proposalId,
      Number(infoCotizacion.montoAcordado) || 0,
    );

    if (!r.ok) {
      // No se puede reintentar en silencio: la plata está cobrada y el
      // trabajador no quedó seleccionado. Tiene que verlo un humano.
      logger.payment('ERROR', `Pago de cotización acreditado pero la aprobación falló: ${r.motivo}`, {
        paymentId: payment.id?.toString(),
        data: { proposalId: infoCotizacion.proposalId, motivo: r.motivo },
        userId: payment.payerId?.toString(),
      });

      const admins = await User.findAll({
        where: { role: { [Op.in]: ['admin', 'super_admin', 'owner'] } },
      });
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin.id,
          type: 'error',
          category: 'admin',
          title: 'Cotización pagada sin contrato',
          message: `Se acreditó un pago de $${payment.amount} ARS por una cotización pero no se pudo crear el contrato: ${r.motivo}`,
          relatedModel: 'Payment',
          relatedId: payment.id,
          sentVia: ['in_app'],
        });
      }
      return;
    }

    // El aviso al trabajador va por dos vias y las dos hacen falta: el socket
    // solo llega si esta con la pantalla abierta, y esto es justamente lo que no
    // se puede perder por no estar mirando.
    if (payment.recipientId) {
      await Notification.create({
        recipientId: payment.recipientId,
        type: 'success',
        category: 'contracts',
        title: 'Te contrataron: el pago ya está acreditado',
        message:
          `El cliente abonó tu cotización de $${Number(payment.amount).toLocaleString('es-AR')} y el contrato ya está creado. ` +
          'Queda a la espera de la aprobación administrativa.',
        relatedModel: 'Contract',
        relatedId: r.contractId,
        actionText: 'Ver contrato',
        sentVia: ['in_app'],
      } as any);
    }

    // El trabajador ve el desenlace en vivo, sin recargar.
    if (payment.recipientId) {
      const { socketService } = await import('../index.js');
      socketService.notifyUser(payment.recipientId.toString(), 'quote:accepted', {
        proposalId: infoCotizacion.proposalId,
        jobId: infoCotizacion.jobId,
        contractId: r.contractId,
        estado: 'pagado_y_aceptado',
      });
    }

    logger.payment('SUCCESS', `Cotización pagada y aceptada`, {
      paymentId: payment.id?.toString(),
      data: { proposalId: infoCotizacion.proposalId, contractId: r.contractId },
      userId: payment.payerId?.toString(),
    });
    return;
  }

  // Check if it's a job publication payment
  if (metadata?.type === 'job_publication' || payment.paymentType === 'job_publication') {
    // *** CAMBIO CRÍTICO: No auto-aprobar, esperar verificación del admin ***
    payment.status = 'pending_verification';
    payment.mercadopagoVerifiedAt = new Date();
    await payment.save();

    const job = await Job.findOne({ where: { publicationPaymentId: payment.id } });
    if (job) {
      // Job stays in pending_payment status until admin approves
      job.status = 'pending_approval';
      await job.save();

      // Notificación al usuario: pago recibido, pendiente de verificación
      await Notification.create({
        recipientId: payment.payerId,
        type: "info",
        category: "payment",
        title: "Pago recibido",
        message: `Tu pago para publicar "${job.title}" fue recibido y está pendiente de verificación por un administrador.`,
        relatedModel: "Job",
        relatedId: job.id,
        sentVia: ["in_app"],
      });

      // Notificación al admin
      const adminUsers = await User.findAll({
        where: {
          role: { [Op.in]: ['admin', 'super_admin', 'owner'] }
        }
      });

      for (const admin of adminUsers) {
        await Notification.create({
          recipientId: admin.id,
          type: "warning",
          category: "admin",
          title: "Nuevo pago pendiente de verificación",
          message: `Pago de MercadoPago para publicar "${job.title}" - $${payment.amount} ARS`,
          relatedModel: "Payment",
          relatedId: payment.id,
          sentVia: ["in_app"],
        });
      }

      logger.payment('PENDING_VERIFICATION', `Job publication payment pending admin verification: ${job.id}`, {
        paymentId: payment.id?.toString(),
        data: { jobId: job.id, jobTitle: job.title },
        userId: payment.payerId?.toString()
      });
    }
  } else {
    // *** CAMBIO CRÍTICO: Contract escrow payment también requiere verificación ***
    payment.status = 'pending_verification';
    payment.mercadopagoVerifiedAt = new Date();
    await payment.save();

    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      // Contract stays pending until admin verifies payment
      (contract as any).paymentStatus = 'pending_verification';
      contract.paymentDate = new Date();
      await contract.save();

      const job = await Job.findByPk(contract.jobId);
      const jobTitle = job?.title || 'Contrato';

      // Notificación a ambas partes: pago pendiente de verificación
      await Promise.all([
        Notification.create({
          recipientId: contract.clientId,
          type: "info",
          category: "payment",
          title: "Pago recibido",
          message: `Tu pago de $${payment.amount} para "${jobTitle}" fue recibido y está pendiente de verificación.`,
          relatedModel: "Contract",
          relatedId: contract.id,
          sentVia: ["in_app", "push"],
        }),
        Notification.create({
          recipientId: contract.doerId,
          type: "info",
          category: "contract",
          title: "Pago pendiente de verificación",
          message: `El pago de $${payment.amount} para "${jobTitle}" está pendiente de verificación del administrador.`,
          relatedModel: "Contract",
          relatedId: contract.id,
          sentVia: ["in_app", "push"],
        })
      ]);

      // Notificación al admin
      const adminUsers = await User.findAll({
        where: {
          role: { [Op.in]: ['admin', 'super_admin', 'owner'] }
        }
      });

      for (const admin of adminUsers) {
        await Notification.create({
          recipientId: admin.id,
          type: "warning",
          category: "admin",
          title: "Nuevo pago de contrato pendiente",
          message: `Pago de MercadoPago para "${jobTitle}" - $${payment.amount} ARS`,
          relatedModel: "Payment",
          relatedId: payment.id,
          sentVia: ["in_app"],
        });
      }

      logger.payment('PENDING_VERIFICATION', `Contract payment pending admin verification: ${contract.id}`, {
        paymentId: payment.id?.toString(),
        amount: payment.amount,
        data: { contractId: contract.id, jobTitle },
        userId: contract.clientId?.toString()
      });
    }
  }
}

/**
 * Manejar pago rechazado
 */
async function handleRejectedPayment(payment: any) {
  payment.status = 'failed';
  await payment.save();

  const contract = await Contract.findByPk(payment.contractId);
  if (contract) {
    contract.paymentStatus = 'pending';
    // No cancelar automáticamente el contrato, solo marcar el pago como fallido
    await contract.save();

    const { Job } = await import('../models/sql/Job.model.js');
    const job = await Job.findByPk(contract.jobId);
    const jobTitle = job?.title || 'Contrato';

    // Notificar al cliente
    await Notification.create({
      recipientId: contract.clientId,
      type: "error",
      category: "payment",
      title: "Pago rechazado",
      message: `El pago para "${jobTitle}" fue rechazado. Por favor, intenta con otro método de pago.`,
      relatedModel: "Contract",
      relatedId: contract.id,
      sentVia: ["in_app", "push", "email"],
    });

    // Email de pago rechazado
    const user = await User.findByPk(contract.clientId);
    if (user) {
      await emailService.sendPaymentNotification(
        contract.clientId.toString(),
        payment.amount || 0,
        `Tu pago para "${jobTitle}" fue rechazado. Por favor, intenta nuevamente con otro método de pago.`,
        payment.id?.toString()
      );
    }

    logger.payment('REJECTED', `Payment rejected for contract: ${contract.id}`, {
      paymentId: payment.id?.toString(),
      status: 'failed',
      data: { contractId: contract.id, reason: payment.mercadopagoStatusDetail },
      userId: contract.clientId?.toString()
    });
  }
}

/**
 * Manejar reembolso
 */
async function handleRefundedPayment(payment: any) {
  payment.status = 'refunded';
  payment.refundedAt = new Date();
  await payment.save();

  const contract = await Contract.findByPk(payment.contractId);
  if (contract) {
    const { Job } = await import('../models/sql/Job.model.js');
    const job = await Job.findByPk(contract.jobId);
    const jobTitle = job?.title || 'Contrato';

    // Notificar a ambas partes
    await Promise.all([
      Notification.create({
        recipientId: contract.clientId,
        type: "info",
        category: "payment",
        title: "Reembolso procesado",
        message: `Se ha procesado el reembolso de $${payment.amount} para "${jobTitle}".`,
        relatedModel: "Contract",
        relatedId: contract.id,
        sentVia: ["in_app", "push", "email"],
      }),
      Notification.create({
        recipientId: contract.doerId,
        type: "info",
        category: "payment",
        title: "Pago reembolsado",
        message: `El pago de "${jobTitle}" ha sido reembolsado al cliente.`,
        relatedModel: "Contract",
        relatedId: contract.id,
        sentVia: ["in_app"],
      })
    ]);

    // Email de reembolso
    const client = await User.findByPk(contract.clientId);
    if (client) {
      await emailService.sendBalanceRefundEmail(
        client.email,
        client.name,
        payment.amount || 0,
        `Reembolso del contrato "${jobTitle}"`,
        client.balanceArs || 0
      );
    }

    logger.payment('REFUNDED', `Payment refunded for contract: ${contract.id}`, {
      paymentId: payment.id?.toString(),
      amount: payment.amount,
      data: { contractId: contract.id, jobTitle },
      userId: contract.clientId?.toString()
    });
  }
}

/**
 * Manejar pago de membresía
 */
async function handleMembershipPayment(userId: string, paymentId: string, status: string) {
  try {
    const user = await User.findByPk(userId);

    if (status === 'approved') {
      await membershipService.activateMembership(userId, paymentId);

      if (user) {
        // Notificación in-app
        await Notification.create({
          recipientId: parseInt(userId),
          type: "success",
          category: "membership",
          title: "¡Membresía activada!",
          message: "Tu membresía PRO ha sido activada. ¡Disfruta de los beneficios!",
          sentVia: ["in_app", "push", "email"],
        });

        // Email de bienvenida PRO
        await emailService.sendEmail({
          to: user.email,
          subject: "¡Bienvenido a PRO! - Doers",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .benefit { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #f59e0b; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🌟 ¡Bienvenido a PRO!</h1>
                </div>
                <div class="content">
                  <p>Hola ${user.name},</p>
                  <p>¡Tu membresía PRO ha sido activada exitosamente!</p>
                  <h3>Tus beneficios:</h3>
                  <div class="benefit">✅ 3 contratos mensuales con solo 3% de comisión</div>
                  <div class="benefit">✅ Badge PRO visible en tu perfil</div>
                  <div class="benefit">✅ Prioridad en búsquedas</div>
                  <div class="benefit">✅ Estadísticas avanzadas</div>
                  <div class="benefit">✅ Soporte prioritario</div>
                  <p>¡Comienza a disfrutar de tus beneficios ahora!</p>
                </div>
              </div>
            </body>
            </html>
          `
        });
      }

      logger.membership('ACTIVATED', `Membership activated for user: ${userId}`, {
        userId,
        data: { paymentId }
      });
    } else if (status === 'rejected' || status === 'cancelled') {
      const membership = await Membership.findOne({ where: { userId } });
      if (membership) {
        membership.status = 'payment_failed';
        await membership.save();
      }

      if (user) {
        user.hasMembership = false;
        await user.save();

        // Notificación de pago fallido
        await Notification.create({
          recipientId: parseInt(userId),
          type: "error",
          category: "membership",
          title: "Pago de membresía fallido",
          message: "No pudimos procesar el pago de tu membresía. Por favor, intenta nuevamente.",
          sentVia: ["in_app", "push", "email"],
        });
      }

      logger.membership('PAYMENT_FAILED', `Membership payment failed for user: ${userId}`, {
        userId,
        data: { paymentId, status }
      });
    }
  } catch (error: any) {
    logger.error('webhooks', `Error handling membership payment: ${error.message}`, {
      data: { error: error.message, userId, paymentId },
      userId
    });
  }
}

/**
 * Manejar webhook de suscripción
 */
async function handleSubscriptionWebhook(data: any, action: string, ip: string) {
  try {
    logger.webhook('mercadopago', 'subscription', `Processing subscription webhook: ${action}`, {
      data: { action, subscriptionId: data?.id },
      ip
    });

    if (action === 'subscription.authorized' || data?.status === 'authorized') {
      const userId = data.external_reference;
      if (userId) {
        await membershipService.renewMembership(userId);

        const user = await User.findByPk(userId);
        if (user) {
          await Notification.create({
            recipientId: parseInt(userId),
            type: "success",
            category: "membership",
            title: "Membresía renovada",
            message: "Tu membresía PRO ha sido renovada automáticamente.",
            sentVia: ["in_app", "email"],
          });
        }

        logger.membership('RENEWED', `Membership renewed for user: ${userId}`, {
          userId,
          data: { subscriptionId: data?.id }
        });
      }
    } else if (action === 'subscription.cancelled' || data?.status === 'cancelled') {
      const userId = data.external_reference;
      if (userId) {
        const membership = await Membership.findOne({ where: { userId } });
        if (membership) {
          membership.status = 'cancelled';
          membership.cancelledAt = new Date();
          await membership.save();
        }

        const user = await User.findByPk(userId);
        if (user) {
          await Notification.create({
            recipientId: parseInt(userId),
            type: "info",
            category: "membership",
            title: "Membresía cancelada",
            message: "Tu membresía PRO ha sido cancelada. Seguirás teniendo acceso hasta el fin del período actual.",
            sentVia: ["in_app", "email"],
          });
        }

        logger.membership('CANCELLED', `Membership cancelled for user: ${userId}`, {
          userId,
          data: { subscriptionId: data?.id }
        });
      }
    }
  } catch (error: any) {
    logger.error('webhooks', `Error handling subscription webhook: ${error.message}`, {
      data: { error: error.message, action }
    });
  }
}

/**
 * POST /api/webhooks/mercadopago/subscription
 * Webhook para suscripciones de MercadoPago (legacy endpoint)
 */
router.post('/mercadopago/subscription', async (req, res) => {
  try {
    const { type, data, action } = req.body;
    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for'] as string) || 'unknown';

    logger.webhook('mercadopago', 'subscription', 'Subscription webhook received (legacy)', {
      data: { type, action, dataId: data?.id },
      ip: ip as string
    });

    res.status(200).send('OK');

    // Procesar usando el handler unificado
    await handleSubscriptionWebhook(data, action || type, ip as string);
  } catch (error: any) {
    logger.error('webhooks', `Error processing subscription webhook: ${error.message}`, {
      data: { error: error.message }
    });
    res.status(500).send('Error processing webhook');
  }
});

export default router;
