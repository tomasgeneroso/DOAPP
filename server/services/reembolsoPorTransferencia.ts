import { Op } from 'sequelize';
import { Payment } from '../models/sql/Payment.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { RefundRequest } from '../models/sql/RefundRequest.model.js';
import { acreditarDevolucion } from './quotePayment.js';
import { acreditadoAlSaldoPorElPago } from './controlesDeDinero.js';
import { logMoneyEvent } from '../utils/auditLog.js';

/**
 * Reembolso de un pago hecho por TRANSFERENCIA bancaria (regla del dueño, 2026-11-09: «interfaz de reembolso de pagos por transferencia, para administración y para
 * clientes»).
 *
 * Un pago de Mercado Pago se devuelve con «Devolver» (la pasarela lo devuelve al medio de pago). Uno por transferencia entró a la cuenta bancaria de DOAPP: devolverlo es
 * mover plata de DOAPP, así que:
 *  - lo decide y lo ejecuta una persona del equipo (nadie reembolsa un pago propio: lo hace otra persona, salvo el dueño; lo vigila la ruta);
 *  - sale por UNA de dos vías: al SALDO del cliente (disponible en el momento: la plata ya está en DOAPP) o a su BANCO (DOAPP transfiere a mano y sube el comprobante);
 *  - se hace con el pago BLOQUEADO en la base: dos reembolsos simultáneos no devuelven dos veces;
 *  - lo devuelto se cuenta igual que en el resto del sistema: lo que volvió al banco va a `payments.refunded_amount` y lo que volvió al saldo queda en el libro del
 *    cliente con `metadata.pagoOrigenId` (`acreditadoAlSaldoPorElPago` lo suma). Restante = monto − refunded_amount − acreditado al saldo;
 *  - queda anotado quién, cuándo, cuánto y por qué.
 *
 * Qué NO se reembolsa por acá: lo que respalda algo en marcha. Si el pago sostiene una publicación activa o un contrato que no terminó, devolverlo deja el trabajo sin
 * plata: primero se cancela (y se liquida con la regla de los términos, 9.1 a 9.3). Esto es para lo excepcional: un pago duplicado, un monto equivocado, algo que no se usó.
 */

export type DestinoDeReembolso = 'saldo' | 'banco';

/** Estados de un pago que significan «la plata ya está en DOAPP» y por eso se puede devolver. */
export const PAGOS_REEMBOLSABLES = ['completed', 'approved', 'verified', 'held_escrow', 'confirmed_for_payout'];
const TIPOS_REEMBOLSABLES = ['job_publication', 'contract_payment', 'escrow_deposit', 'budget_increase'];
export const MINIMO_DEL_MOTIVO_DE_REEMBOLSO = 15;

const r2 = (n: number) => Math.round(n * 100) / 100;
const pesos = (n: number) => `$${Number(n).toLocaleString('es-AR')}`;

export interface Bloqueo {
  code: string;
  message: string;
}

/** ¿Es un pago por transferencia? (Los de Mercado Pago, PayPal y demás pasarelas se devuelven por su pasarela.) */
export function esPagoPorTransferencia(pago: { paymentMethod?: unknown; mercadopagoPaymentId?: unknown; paypalCaptureId?: unknown }): boolean {
  return !pago.mercadopagoPaymentId && !pago.paypalCaptureId && String(pago.paymentMethod ?? '') === 'bank_transfer';
}

/** Cuánto queda de un pago sin devolver: el monto, menos lo que volvió al banco, menos lo que ya se acreditó al saldo del cliente por este pago. */
export async function restanteReembolsable(pago: { id?: unknown; amount?: unknown; refundedAmount?: unknown }): Promise<number> {
  const alSaldo = pago.id ? await acreditadoAlSaldoPorElPago(String(pago.id)) : 0;
  return Math.max(0, r2((Number(pago.amount) || 0) - (Number(pago.refundedAmount) || 0) - alSaldo));
}

/** Por qué NO se puede reembolsar este pago ahora, o null si se puede. */
export async function bloqueoDelReembolso(pago: any): Promise<Bloqueo | null> {
  if (!esPagoPorTransferencia(pago)) {
    return { code: 'REEMBOLSO_NO_ES_TRANSFERENCIA', message: 'Este pago no se hizo por transferencia: se devuelve por su medio de pago (Mercado Pago: botón «Devolver»).' };
  }
  if (!TIPOS_REEMBOLSABLES.includes(String(pago.paymentType))) {
    return { code: 'REEMBOLSO_TIPO_DE_PAGO', message: `Un pago de tipo «${pago.paymentType}» no se reembolsa por acá.` };
  }
  if (!PAGOS_REEMBOLSABLES.includes(String(pago.status))) {
    return { code: 'REEMBOLSO_PAGO_SIN_PLATA', message: `Este pago está «${pago.status}»: todavía no tiene plata en DOAPP (o ya no la tiene), así que no hay nada para devolver.` };
  }
  if ((await restanteReembolsable(pago)) <= 0) {
    return { code: 'REEMBOLSO_YA_DEVUELTO', message: 'Este pago ya se devolvió por completo.' };
  }

  // Lo que respalda algo en marcha no se devuelve sin cancelarlo antes.
  if (pago.contractId) {
    const contrato: any = await Contract.findByPk(pago.contractId, { attributes: ['id', 'status'] });
    if (contrato && !['cancelled', 'rejected'].includes(String(contrato.status))) {
      return { code: 'REEMBOLSO_CONTRATO_VIGENTE', message: 'Este pago respalda un contrato que sigue vigente. Cancelá el contrato primero: así se liquida con la regla de los términos (9.2 y 9.3).' };
    }
  }
  // Los trabajos que este pago respalda: el que el pago dice (`job_id`) y el que lo tiene como pago de su publicación (`publication_payment_id`). Se miran los dos porque
  // `job_id` se completa por el modelo y un pago anterior a eso, o uno que se vinculó por otra vía, puede no tenerlo.
  const trabajos: any[] = await Job.findAll({
    where: { [Op.or]: [{ publicationPaymentId: pago.id }, ...(pago.jobId ? [{ id: pago.jobId }] : [])] } as any,
    attributes: ['id', 'status', 'publicationPaymentId'],
  });
  for (const trabajo of trabajos) {
    if (String(trabajo.publicationPaymentId) === String(pago.id) && String(trabajo.status) !== 'cancelled') {
      return { code: 'REEMBOLSO_PUBLICACION_ACTIVA', message: 'Este pago sostiene una publicación que sigue activa. Cancelá la publicación primero: así se liquida con la regla de los términos (9.1).' };
    }
    const vigentes = await Contract.count({ where: { jobId: trabajo.id, status: { [Op.notIn]: ['cancelled', 'rejected'] } } as any });
    if (vigentes > 0) {
      return { code: 'REEMBOLSO_CONTRATO_VIGENTE', message: 'Hay un contrato vigente respaldado por este pago. Cancelalo primero.' };
    }
  }
  return null;
}

export interface EstadoDeReembolsoParaElCliente {
  puede: boolean;
  motivoNo: string | null;
  restante: number;
  solicitud: { id: string; status: string; createdAt: string; resolutionNote: string | null; destination: string | null } | null;
}

/** Lo que la pantalla del cliente necesita para ofrecer (o no) «Pedir reembolso» en un pago. Solo para pagos por transferencia. */
export async function estadoDeReembolsoParaElCliente(pago: any, solicitudes: any[]): Promise<EstadoDeReembolsoParaElCliente> {
  const delPago = solicitudes.filter((s) => String(s.paymentId) === String(pago.id)).sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
  const ultima = delPago[0] ?? null;
  const solicitud = ultima
    ? { id: String(ultima.id), status: String(ultima.status), createdAt: new Date(ultima.createdAt).toISOString(), resolutionNote: ultima.resolutionNote ?? null, destination: ultima.destination ?? null }
    : null;
  const restante = await restanteReembolsable(pago);
  if (ultima?.status === 'pending') return { puede: false, motivoNo: 'Ya pediste el reembolso: lo está revisando el equipo.', restante, solicitud };
  const bloqueo = await bloqueoDelReembolso(pago);
  return { puede: !bloqueo, motivoNo: bloqueo?.message ?? null, restante, solicitud };
}

export type ResultadoDelReembolso =
  | { ok: true; pagoId: string; monto: number; destino: DestinoDeReembolso; completo: boolean; restante: number }
  | { ok: false; status: number; code: string; message: string };

export interface ArgumentosDelReembolso {
  pagoId: string;
  /** Vacío = todo lo que queda. */
  monto?: number | null;
  destino: DestinoDeReembolso;
  motivo: string;
  quien: string;
  /** Obligatorio si sale por el banco: el comprobante de la transferencia que DOAPP le hizo al cliente. */
  comprobanteUrl?: string | null;
  /** El dueño reembolsa un pago del que es parte: se permite, pero queda anotado (como en las aprobaciones). */
  aprobacionPropiaDelDueno?: boolean;
}

const falla = (status: number, code: string, message: string): ResultadoDelReembolso => ({ ok: false, status, code, message });

/**
 * Los mismos controles que cualquier otra salida de dinero del equipo: arriba de `DEVOLUCION_QUE_PIDE_DUENO_ARS` lo hace el dueño, desde `MONTO_DOBLE_CONFIRMACION_ARS`
 * pide contraseña y 2FA, y el tope diario del rol. Devuelve null si puede seguir, o la respuesta HTTP que hay que dar.
 */
export async function controlesDelEquipoParaReembolsar(a: { adminId: string; rol: string; importe: number; passwordVerified: boolean }): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const { DEVOLUCION_QUE_PIDE_DUENO_ARS } = await import('../../shared/constants/topesDeDinero.js');
  const { verificarTopeDiario, requiereDobleConfirmacion, MONTO_DOBLE_CONFIRMACION_ARS } = await import('./paymentSafeguards.js');
  if (a.importe > DEVOLUCION_QUE_PIDE_DUENO_ARS && a.rol !== 'owner') {
    return { status: 403, body: { success: false, code: 'REEMBOLSO_PIDE_AL_DUENO', message: `Un reembolso de más de ${pesos(DEVOLUCION_QUE_PIDE_DUENO_ARS)} lo hace el dueño. Pasale el caso.` } };
  }
  if (requiereDobleConfirmacion(a.importe) && !a.passwordVerified) {
    return {
      status: 403,
      body: { success: false, requiereVerificacion: true, monto: a.importe, message: `Los reembolsos de ${pesos(MONTO_DOBLE_CONFIRMACION_ARS)} o más piden confirmar tu contraseña y tu código de 2FA.` },
    };
  }
  const tope = await verificarTopeDiario(a.adminId, a.rol, a.importe, 'devolucion');
  if (!tope.permitido) return { status: 403, body: { success: false, message: tope.motivo, topeDiario: tope.detalle } };
  return null;
}

/** Ejecuta el reembolso. NO decide permisos (la ruta ya exigió un rol y que quien reembolsa no sea parte del pago). */
export async function reembolsarPagoPorTransferencia(a: ArgumentosDelReembolso): Promise<ResultadoDelReembolso> {
  const motivo = String(a.motivo ?? '').trim().replace(/\s+/g, ' ');
  if (motivo.length < MINIMO_DEL_MOTIVO_DE_REEMBOLSO) {
    return falla(400, 'REEMBOLSO_SIN_MOTIVO', `Escribí el motivo del reembolso (al menos ${MINIMO_DEL_MOTIVO_DE_REEMBOLSO} caracteres).`);
  }
  if (a.destino !== 'saldo' && a.destino !== 'banco') {
    return falla(400, 'REEMBOLSO_DESTINO', 'Elegí a dónde va el reembolso: al saldo del cliente o a su banco.');
  }
  if (a.destino === 'banco' && !(typeof a.comprobanteUrl === 'string' && a.comprobanteUrl.trim().startsWith('/uploads/'))) {
    return falla(400, 'REEMBOLSO_SIN_COMPROBANTE', 'Para devolver al banco del cliente hay que subir el comprobante de la transferencia que hiciste.');
  }

  const { sequelize } = await import('../config/database.js');
  let hecho!: { pago: any; monto: number; completo: boolean; restante: number };

  const error = await sequelize.transaction(async (t): Promise<ResultadoDelReembolso | null> => {
    // El pago queda bloqueado hasta el final: un segundo reembolso del mismo pago espera, lee el restante ya descontado y se frena solo.
    const pago: any = await Payment.findByPk(a.pagoId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!pago) return falla(404, 'REEMBOLSO_PAGO_NO_ENCONTRADO', 'No existe ese pago.');

    const bloqueo = await bloqueoDelReembolso(pago);
    if (bloqueo) return falla(409, bloqueo.code, bloqueo.message);

    const restante = await restanteReembolsable(pago);
    const monto = a.monto === undefined || a.monto === null ? restante : r2(Number(a.monto));
    if (!Number.isFinite(monto) || monto <= 0) return falla(400, 'REEMBOLSO_MONTO', 'El monto a devolver tiene que ser mayor que cero.');
    if (monto > restante + 0.005) return falla(400, 'REEMBOLSO_MONTO', `No se puede devolver más de lo que queda del pago (${pesos(restante)}).`);
    const completo = monto + 0.005 >= restante;

    if (a.destino === 'saldo') {
      // sin-espera: el pago fue por transferencia bancaria: la plata ya está en la cuenta de DOAPP, así que el saldo está disponible en el momento.
      await acreditarDevolucion(String(pago.payerId), monto, `Reembolso del pago ${String(pago.id).slice(0, 8)}: ${motivo}`, {
        relatedModel: 'Payment',
        relatedId: String(pago.id),
        metadata: { pagoOrigenId: String(pago.id), origen: 'reembolso_por_transferencia', motivo },
      });
    } else {
      pago.refundedAmount = r2((Number(pago.refundedAmount) || 0) + monto);
    }
    if (completo) pago.status = 'refunded';
    pago.refundReason = motivo;
    pago.refundedAt = new Date();
    pago.refundedBy = a.quien;
    await pago.save({ transaction: t });

    hecho = { pago, monto, completo, restante: r2(restante - monto) };
    return null;
  });
  if (error) return error;

  const { pago, monto, completo, restante } = hecho;
  await logMoneyEvent({
    action: 'REFUND_TRANSFER',
    actor: `admin:${a.quien}`,
    severity: 'high',
    description: `Reembolso de ${pesos(monto)} de un pago por transferencia, ${a.destino === 'saldo' ? 'al saldo del cliente' : 'al banco del cliente'}: ${motivo}`,
    contractId: pago.contractId ? String(pago.contractId) : undefined,
    paymentId: String(pago.id),
    userId: String(pago.payerId),
    monto,
    moneda: String(pago.currency || 'ARS'),
    metadata: { destino: a.destino, comprobanteUrl: a.comprobanteUrl ?? null, completo, restante, motivo, ...(a.aprobacionPropiaDelDueno ? { aprobacionPropiaDelDueno: true } : {}) },
  }).catch(() => undefined);

  await Notification.create({
    recipientId: pago.payerId,
    type: 'info',
    category: 'payment',
    title: 'Te devolvimos tu dinero',
    message:
      a.destino === 'saldo'
        ? `Se acreditaron ${pesos(monto)} a tu saldo, disponibles ya. Motivo: ${motivo}`
        : `Te transferimos ${pesos(monto)} a tu banco. Según el banco, puede tardar hasta un día hábil en aparecer en tu cuenta. Motivo: ${motivo}`,
    relatedModel: 'Payment',
    relatedId: pago.id,
    sentVia: ['in_app'],
  } as any).catch(() => undefined);

  return { ok: true, pagoId: String(pago.id), monto, destino: a.destino, completo, restante };
}

// ───────────────────────── Pedidos del cliente ─────────────────────────

export type ResultadoDeUnPedido = { ok: true; pedido: any } | { ok: false; status: number; code: string; message: string };
const fallaP = (status: number, code: string, message: string): ResultadoDeUnPedido => ({ ok: false, status, code, message });

/** El cliente pide que le devuelvan un pago suyo por transferencia. Solo hay un pedido pendiente por pago. */
export async function crearPedidoDeReembolso(a: { pagoId: string; userId: string; monto?: number | null; motivo: string }): Promise<ResultadoDeUnPedido> {
  const motivo = String(a.motivo ?? '').trim().replace(/\s+/g, ' ');
  if (motivo.length < MINIMO_DEL_MOTIVO_DE_REEMBOLSO) {
    return fallaP(400, 'REEMBOLSO_SIN_MOTIVO', `Contanos por qué pedís el reembolso (al menos ${MINIMO_DEL_MOTIVO_DE_REEMBOLSO} caracteres).`);
  }
  const pago: any = await Payment.findByPk(a.pagoId);
  // Un pago ajeno se responde igual que uno que no existe: no se revela que existe.
  if (!pago || String(pago.payerId) !== String(a.userId)) return fallaP(404, 'REEMBOLSO_PAGO_NO_ENCONTRADO', 'No encontramos ese pago.');
  const bloqueo = await bloqueoDelReembolso(pago);
  if (bloqueo) return fallaP(409, bloqueo.code, bloqueo.message);

  const restante = await restanteReembolsable(pago);
  const monto = a.monto === undefined || a.monto === null ? null : r2(Number(a.monto));
  if (monto !== null && (!Number.isFinite(monto) || monto <= 0 || monto > restante + 0.005)) {
    return fallaP(400, 'REEMBOLSO_MONTO', `El monto tiene que ser mayor que cero y no más de ${pesos(restante)}.`);
  }
  if (await RefundRequest.count({ where: { paymentId: pago.id, status: 'pending' } as any })) {
    return fallaP(409, 'REEMBOLSO_PEDIDO_REPETIDO', 'Ya hay un pedido de reembolso pendiente para este pago.');
  }
  try {
    const pedido = await RefundRequest.create({ paymentId: pago.id, requestedBy: a.userId, amount: monto, reason: motivo, status: 'pending' } as any);
    return { ok: true, pedido };
  } catch (e: any) {
    // El índice único parcial (un pendiente por pago) es la última defensa contra dos pedidos juntos.
    if (e?.name === 'SequelizeUniqueConstraintError' || e?.parent?.code === '23505') {
      return fallaP(409, 'REEMBOLSO_PEDIDO_REPETIDO', 'Ya hay un pedido de reembolso pendiente para este pago.');
    }
    throw e;
  }
}

/** El cliente retira su pedido mientras nadie lo resolvió. */
export async function cancelarPedidoDeReembolso(a: { id: string; userId: string }): Promise<ResultadoDeUnPedido> {
  const [n] = await RefundRequest.update(
    { status: 'cancelled', resolvedAt: new Date() } as any,
    { where: { id: a.id, requestedBy: a.userId, status: 'pending' } as any },
  );
  if (n === 0) return fallaP(409, 'REEMBOLSO_PEDIDO_NO_PENDIENTE', 'Ese pedido ya no está pendiente.');
  return { ok: true, pedido: await RefundRequest.findByPk(a.id) };
}

/** Una persona del equipo aprueba el pedido: se reclama primero (nadie más lo resuelve) y recién después se mueve la plata; si falla, vuelve a quedar pendiente. */
export async function aprobarPedidoDeReembolso(a: {
  id: string;
  quien: string;
  destino: DestinoDeReembolso;
  monto?: number | null;
  nota?: string | null;
  comprobanteUrl?: string | null;
  aprobacionPropiaDelDueno?: boolean;
}): Promise<{ ok: true; reembolso: Extract<ResultadoDelReembolso, { ok: true }>; pedido: any } | { ok: false; status: number; code: string; message: string }> {
  const pedido: any = await RefundRequest.findByPk(a.id);
  if (!pedido) return { ok: false, status: 404, code: 'REEMBOLSO_PEDIDO_NO_ENCONTRADO', message: 'No existe ese pedido.' };
  const nota = String(a.nota ?? '').trim();
  const [n] = await RefundRequest.update({ status: 'approved' } as any, { where: { id: a.id, status: 'pending' } as any });
  if (n === 0) return { ok: false, status: 409, code: 'REEMBOLSO_PEDIDO_NO_PENDIENTE', message: 'Ese pedido ya lo resolvió otra persona (o lo retiró el cliente). Actualizá la pantalla.' };

  const volverAPendiente = () => RefundRequest.update({ status: 'pending' } as any, { where: { id: a.id, status: 'approved' } as any }).catch(() => undefined);
  const r = await reembolsarPagoPorTransferencia({
    pagoId: String(pedido.paymentId),
    monto: a.monto ?? (pedido.amount === null || pedido.amount === undefined ? null : Number(pedido.amount)),
    destino: a.destino,
    motivo: `Pedido del cliente: ${String(pedido.reason)}${nota ? ` — Respuesta: ${nota}` : ''}`.slice(0, 900),
    quien: a.quien,
    comprobanteUrl: a.comprobanteUrl,
    aprobacionPropiaDelDueno: a.aprobacionPropiaDelDueno,
  }).catch(async (e) => {
    await volverAPendiente();
    throw e;
  });
  if (r.ok === false) {
    await volverAPendiente();
    return { ok: false, status: r.status, code: r.code, message: r.message };
  }
  await RefundRequest.update(
    { destination: a.destino, resolvedAmount: r.monto, resolvedBy: a.quien, resolvedAt: new Date(), resolutionNote: nota || null, proofUrl: a.comprobanteUrl ?? null } as any,
    { where: { id: a.id } as any },
  );
  return { ok: true, reembolso: r, pedido: await RefundRequest.findByPk(a.id) };
}

/** Una persona del equipo rechaza el pedido, con el motivo que va a leer el cliente. */
export async function rechazarPedidoDeReembolso(a: { id: string; quien: string; nota: string }): Promise<ResultadoDeUnPedido> {
  const nota = String(a.nota ?? '').trim().replace(/\s+/g, ' ');
  if (nota.length < MINIMO_DEL_MOTIVO_DE_REEMBOLSO) {
    return fallaP(400, 'REEMBOLSO_SIN_MOTIVO', `Escribí por qué se rechaza (al menos ${MINIMO_DEL_MOTIVO_DE_REEMBOLSO} caracteres): lo lee el cliente.`);
  }
  const pedido: any = await RefundRequest.findByPk(a.id);
  if (!pedido) return fallaP(404, 'REEMBOLSO_PEDIDO_NO_ENCONTRADO', 'No existe ese pedido.');
  const [n] = await RefundRequest.update(
    { status: 'rejected', resolvedBy: a.quien, resolvedAt: new Date(), resolutionNote: nota } as any,
    { where: { id: a.id, status: 'pending' } as any },
  );
  if (n === 0) return fallaP(409, 'REEMBOLSO_PEDIDO_NO_PENDIENTE', 'Ese pedido ya lo resolvió otra persona (o lo retiró el cliente). Actualizá la pantalla.');
  await logMoneyEvent({
    action: 'REFUND_TRANSFER_REJECTED',
    actor: `admin:${a.quien}`,
    severity: 'medium',
    description: `Se rechazó el pedido de reembolso: ${nota}`,
    paymentId: String(pedido.paymentId),
    userId: String(pedido.requestedBy),
    metadata: { pedidoId: String(pedido.id), nota },
  }).catch(() => undefined);
  await Notification.create({
    recipientId: pedido.requestedBy,
    type: 'info',
    category: 'payment',
    title: 'Tu pedido de reembolso no se aprobó',
    message: `${nota} Si tenés dudas, escribinos desde el Centro de Ayuda.`,
    relatedModel: 'Payment',
    relatedId: pedido.paymentId,
    sentVia: ['in_app'],
  } as any).catch(() => undefined);
  return { ok: true, pedido: await RefundRequest.findByPk(a.id) };
}

/** Los pedidos de un cliente sobre un conjunto de pagos (para mostrarle el estado en cada pago). */
export async function pedidosDeReembolsoDe(userId: string, idsDePagos: string[]): Promise<any[]> {
  if (idsDePagos.length === 0) return [];
  return RefundRequest.findAll({ where: { requestedBy: userId, paymentId: { [Op.in]: idsDePagos } } as any, order: [['createdAt', 'DESC']] });
}
