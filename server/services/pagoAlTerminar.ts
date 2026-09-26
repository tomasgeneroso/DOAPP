import { Op } from 'sequelize';
import { Payment } from '../models/sql/Payment.model.js';
import { PaymentProof } from '../models/sql/PaymentProof.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { calculateCommission } from './commissionService.js';
import { splitFees } from '../../shared/pricing/processingCost.js';
import {
  MODULO_PAGO_AL_TERMINAR,
  DIAS_PARA_PAGAR_LA_ORDEN,
  cubiertoPorDoapp,
  type MetodoDeOrden,
} from '../../shared/pagos/modoDePago.js';
import { moduloActivo } from './moduleFlags.js';
import mercadopagoService from './mercadopago.js';
import { config } from '../config/env.js';

/**
 * La orden de pago del modo sin protección.
 *
 * Cómo funciona el modo: no hay dinero retenido en ningún momento. Cuando el
 * trabajo termina, la aplicación crea una orden de pago y el cliente la paga
 * ahí. Recién en ese momento DOAPP cobra comisión — y por lo tanto recién en
 * ese momento el servicio de mediación está financiado y disponible.
 *
 * Esa es toda la regla de responsabilidad, y está escrita en
 * `shared/pagos/modoDePago.ts` para que la digan igual el código, los términos
 * y los tres avisos de la interfaz. Un pago hecho por fuera —efectivo,
 * transferencia entre las partes— no pasa por acá, no genera comisión y no
 * habilita reclamo, simplemente porque DOAPP no vio nada y no tiene nada que
 * retener.
 *
 * Dos formas de pagar la orden, las dos con verificación:
 *
 *   `mercadopago`  — link de pago; lo confirma el webhook contra el ID de
 *                    preferencia de la orden. Se verifica solo.
 *   `comprobante`  — el cliente sube el comprobante de una transferencia y un
 *                    admin lo mira. Más lento, y necesario: no todo el mundo
 *                    paga con pasarela.
 *
 * En los dos casos la orden queda 'completed' o 'verified' sólo cuando alguien
 * —el webhook o una persona— confirmó que el dinero entró. Mientras tanto no
 * está cubierta, y la aplicación lo dice.
 */

export class OrdenInvalida extends Error {}

export const TIPO_ORDEN = 'on_completion' as const;

/** Si el módulo está encendido. Apagado por defecto y apagado ante cualquier duda. */
export const moduloPagoAlTerminarActivo = (): Promise<boolean> =>
  moduloActivo(MODULO_PAGO_AL_TERMINAR, false);

export interface DesgloseDeOrden {
  precio: number;
  comision: number;
  iva: number;
  procesamiento: number;
  ivaProcesamiento: number;
  total: number;
  cobraElTrabajador: number;
}

/**
 * Cuánto se le cobra al cliente por esta orden.
 *
 * Las mismas cuentas que en el modo con protección, y a propósito: que el pago
 * sea al final no cambia quién paga qué. El cliente paga precio + comisión +
 * procesamiento + IVA, y el trabajador cobra el precio completo.
 */
export async function calcularOrden(contrato: Contract): Promise<DesgloseDeOrden> {
  const precio = Number(contrato.allocatedAmount ?? contrato.price);
  if (!Number.isFinite(precio) || precio <= 0) {
    throw new OrdenInvalida('El contrato no tiene un precio con el que armar la orden.');
  }

  const comision = await calculateCommission(contrato.clientId, precio);
  const reparto = splitFees(precio, comision.commission, comision.vat);

  return {
    precio: reparto.jobPrice,
    comision: reparto.commission,
    iva: reparto.vat,
    procesamiento: reparto.processingCharge,
    ivaProcesamiento: reparto.processingVat,
    total: reparto.clientPays,
    cobraElTrabajador: reparto.workerReceives,
  };
}

/** La orden viva de un contrato, si tiene una. */
export async function ordenDelContrato(contractId: string): Promise<Payment | null> {
  return Payment.findOne({
    where: {
      contractId,
      paymentType: TIPO_ORDEN,
      status: { [Op.notIn]: ['cancelled', 'rejected', 'failed'] },
    },
    order: [['createdAt', 'DESC']],
    include: [{ model: PaymentProof, as: 'proofs', required: false }],
  });
}

/**
 * Crea la orden cuando el trabajo termina.
 *
 * Se llama una vez por contrato. Si ya existe una orden viva, devuelve ésa en
 * vez de crear otra: dos órdenes abiertas para el mismo trabajo es la forma
 * más fácil de que alguien pague dos veces.
 */
export async function crearOrden(
  contractId: string,
  metodo: MetodoDeOrden,
  actorId: string,
): Promise<{ orden: Payment; desglose: DesgloseDeOrden; linkDePago?: string }> {
  if (!(await moduloPagoAlTerminarActivo())) {
    throw new OrdenInvalida('El pago al terminar está desactivado.');
  }

  const contrato = await Contract.findByPk(contractId, {
    include: [
      { model: User, as: 'client', attributes: ['id', 'email', 'name'] },
      { model: User, as: 'doer', attributes: ['id', 'name'] },
    ],
  });
  if (!contrato) throw new OrdenInvalida('El contrato no existe.');

  if (contrato.paymentMode !== 'on_completion') {
    throw new OrdenInvalida('Este contrato tiene protección de pago: el dinero ya está retenido.');
  }

  // Sólo el trabajador o el cliente del contrato pueden pedir la orden. Un
  // tercero que adivine un id de contrato no puede generar un cobro.
  if (actorId !== contrato.doerId && actorId !== contrato.clientId) {
    throw new OrdenInvalida('No sos parte de este contrato.');
  }

  /**
   * El trabajo tiene que estar terminado. Es la condición del modo: si se
   * pudiera generar la orden antes, sería un pago por adelantado con otro
   * nombre, y sin la retención que lo hace seguro.
   */
  const ESTADOS_TERMINADO = ['awaiting_confirmation', 'completed'];
  if (!ESTADOS_TERMINADO.includes(contrato.status)) {
    throw new OrdenInvalida(
      'La orden de pago se crea cuando el trabajo está terminado, no antes.',
    );
  }

  const existente = await ordenDelContrato(contractId);
  if (existente) {
    const desglose = await calcularOrden(contrato);
    return { orden: existente, desglose, linkDePago: (existente.metadata as any)?.linkDePago };
  }

  const desglose = await calcularOrden(contrato);
  const vence = new Date(Date.now() + DIAS_PARA_PAGAR_LA_ORDEN * 24 * 60 * 60 * 1000);

  const orden = await Payment.create({
    contractId,
    payerId: contrato.clientId,
    recipientId: contrato.doerId,
    amount: desglose.total,
    currency: 'ARS',
    platformFee: desglose.comision,
    platformFeePercentage: desglose.precio > 0 ? (desglose.comision / desglose.precio) * 100 : 0,
    processingCharge: desglose.procesamiento,
    workerPaymentAmount: desglose.cobraElTrabajador,
    paymentType: TIPO_ORDEN,
    paymentMethod: metodo === 'mercadopago' ? 'mercadopago' : 'bank_transfer',
    // Nunca hubo nada retenido: eso es lo que distingue este modo del otro.
    isEscrow: false,
    status: 'pending',
    expiresAt: vence,
    metadata: { metodo, creadaPor: actorId, desglose },
  } as any);

  if (metodo !== 'mercadopago') {
    return { orden, desglose };
  }

  /**
   * El link de pago. Si MercadoPago no contesta, la orden NO se borra: queda
   * creada y el cliente puede pagarla subiendo un comprobante. Perder la orden
   * por una caída de la pasarela obligaría a rehacer todo el cierre del
   * contrato.
   */
  try {
    const pago = await mercadopagoService.createPayment({
      amount: desglose.total,
      currency: 'ARS',
      description: `Trabajo terminado — contrato ${contractId.slice(0, 8)}`,
      provider: 'mercadopago',
      metadata: { paymentId: orden.id, contractId, tipo: TIPO_ORDEN },
      successUrl: `${config.clientUrl}/contracts/${contractId}?pago=ok`,
      cancelUrl: `${config.clientUrl}/contracts/${contractId}?pago=cancelado`,
      customerEmail: (contrato as any).client?.email,
    } as any);

    await orden.update({
      mercadopagoPreferenceId: pago.providerPaymentId || pago.paymentId,
      metadata: { ...(orden.metadata as any), linkDePago: pago.checkoutUrl },
    });

    return { orden, desglose, linkDePago: pago.checkoutUrl };
  } catch (e: any) {
    console.error(`❌ No se pudo crear el link de pago de la orden ${orden.id}:`, e?.message);
    await orden.update({
      metadata: { ...(orden.metadata as any), errorLink: String(e?.message || '').slice(0, 500) },
    });
    return { orden, desglose };
  }
}

/**
 * Confirma que el pago entró por la orden de la aplicación.
 *
 * Es el único lugar donde una orden pasa a estar cubierta, y la condición es
 * literal: el pago que informa MercadoPago tiene que corresponder a la
 * preferencia de ESTA orden. No alcanza con que exista un pago aprobado del
 * mismo cliente por el mismo monto — eso podría ser cualquier otra cosa.
 *
 * @returns true si la orden quedó confirmada.
 */
export async function confirmarPagoDeOrden(
  ordenId: string,
  datos: { mercadopagoPaymentId: string; preferenceId?: string; estado: string; monto?: number },
): Promise<boolean> {
  const orden = await Payment.findByPk(ordenId);
  if (!orden || orden.paymentType !== TIPO_ORDEN) return false;

  if (orden.status === 'completed' || orden.status === 'verified') {
    // Ya estaba confirmada. MercadoPago reintenta los webhooks, y confirmar
    // dos veces no puede cobrar ni notificar dos veces.
    return true;
  }

  if (datos.estado !== 'approved') {
    await orden.update({
      mercadopagoStatus: datos.estado,
      metadata: { ...(orden.metadata as any), ultimoEstadoMP: datos.estado },
    });
    return false;
  }

  /**
   * Que el pago sea de esta orden y no de otra. Si la preferencia no coincide,
   * no se confirma y queda anotado: es exactamente el caso que hay que poder
   * revisar a mano, no el que hay que resolver optimistamente.
   */
  if (
    datos.preferenceId &&
    orden.mercadopagoPreferenceId &&
    datos.preferenceId !== orden.mercadopagoPreferenceId
  ) {
    console.warn(
      `⚠️ Webhook con preferencia ${datos.preferenceId} sobre la orden ${ordenId}, que espera ${orden.mercadopagoPreferenceId}`,
    );
    await orden.update({
      metadata: {
        ...(orden.metadata as any),
        preferenciaQueNoCoincide: datos.preferenceId,
      },
    });
    return false;
  }

  await orden.update({
    status: 'completed',
    mercadopagoPaymentId: datos.mercadopagoPaymentId,
    mercadopagoStatus: datos.estado,
    metadata: {
      ...(orden.metadata as any),
      confirmadoPorLaApp: true,
      confirmadoEn: new Date().toISOString(),
      confirmadoPor: 'webhook',
      montoInformado: datos.monto,
    },
  });

  await reflejarEnElContrato(orden);

  return true;
}

/**
 * Deja constancia del pago en el propio contrato.
 *
 * Sin esto la orden queda pagada y el contrato sigue diciendo "se paga al
 * terminar (sin retención)" para siempre, que es falso apenas se paga. Y hace
 * falta por otra razón más práctica: los listados necesitan saber si un
 * contrato está cobrado para mostrarlo distinto y para habilitar el reclamo, y
 * consultar la orden de cada fila serían veinte consultas por pantalla.
 *
 * No tumba nada si falla: el estado de la orden es la fuente, esto es el
 * reflejo.
 */
async function reflejarEnElContrato(orden: Payment): Promise<void> {
  if (!orden.contractId) return;
  try {
    await Contract.update(
      { paymentStatus: 'completed' },
      { where: { id: orden.contractId } },
    );
  } catch (e: any) {
    console.warn(
      `⚠️ Orden ${orden.id} confirmada pero no se pudo reflejar en el contrato ${orden.contractId}: ${e?.message}`,
    );
  }
}

/**
 * Un admin da por buena la transferencia de un comprobante.
 *
 * El camino manual existe porque no todo el mundo paga con pasarela, y la
 * alternativa a tenerlo es que esos pagos ocurran por fuera de la aplicación
 * —donde DOAPP no cobra comisión y no puede mediar—. Que sea más trabajo para
 * el admin es el precio de que la operación quede adentro.
 */
export async function verificarComprobante(
  ordenId: string,
  adminId: string,
  decision: 'aprobar' | 'rechazar',
  motivo?: string,
): Promise<Payment> {
  const orden = await Payment.findByPk(ordenId, {
    include: [{ model: PaymentProof, as: 'proofs', required: false }],
  });
  if (!orden || orden.paymentType !== TIPO_ORDEN) {
    throw new OrdenInvalida('La orden no existe.');
  }

  if (orden.status === 'completed' || orden.status === 'verified') {
    throw new OrdenInvalida('Esta orden ya estaba confirmada.');
  }

  if (decision === 'rechazar') {
    await orden.update({
      status: 'rejected',
      metadata: {
        ...(orden.metadata as any),
        rechazadaPor: adminId,
        motivoDelRechazo: motivo || null,
        rechazadaEn: new Date().toISOString(),
      },
    });
    return orden;
  }

  /**
   * Aprobar sin comprobante activo no es aprobar: es marcar como pagada una
   * orden sobre la que no hay nada que mirar. El filtro por `isActive` importa
   * — las notas del expediente también viven en esta tabla y no son
   * comprobantes.
   */
  const comprobantes = ((orden as any).proofs || []).filter(
    (p: any) => p.isActive && p.kind !== 'note',
  );
  if (comprobantes.length === 0) {
    throw new OrdenInvalida('No hay ningún comprobante cargado en esta orden.');
  }

  await orden.update({
    status: 'verified',
    metadata: {
      ...(orden.metadata as any),
      confirmadoPorLaApp: true,
      confirmadoEn: new Date().toISOString(),
      confirmadoPor: 'admin',
      verificadoPor: adminId,
    },
  });

  await reflejarEnElContrato(orden);

  return orden;
}

/**
 * Si esta orden habilita reclamo con intervención de DOAPP.
 *
 * Envuelve la regla compartida para que el servidor no la vuelva a escribir:
 * la condición es una sola y vive en `shared/pagos/modoDePago.ts`.
 */
export function ordenCubierta(orden: Payment | null | undefined): boolean {
  if (!orden) return false;
  return cubiertoPorDoapp({
    estado: orden.status,
    confirmadoPorLaApp: Boolean((orden.metadata as any)?.confirmadoPorLaApp),
  });
}

/**
 * Marca como vencidas las órdenes que nadie pagó.
 *
 * No cancela el contrato ni castiga a nadie: sólo deja de decir que hay una
 * orden esperando. La deuda entre las partes sigue existiendo; lo que ya no
 * existe es la vía por la que DOAPP podía mediar, y eso tiene que ser visible.
 */
export async function vencerOrdenesViejas(): Promise<number> {
  const vencidas = await Payment.update(
    { status: 'cancelled' },
    {
      where: {
        paymentType: TIPO_ORDEN,
        status: 'pending',
        expiresAt: { [Op.lt]: new Date() },
      },
    },
  );
  const cuantas = Array.isArray(vencidas) ? Number(vencidas[0]) : 0;
  if (cuantas > 0) console.log(`⏰ ${cuantas} órdenes de pago al terminar vencidas`);
  return cuantas;
}
