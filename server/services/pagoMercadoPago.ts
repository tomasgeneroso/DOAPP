/**
 * ¿El pago que MercadoPago nos muestra es EL pago que esperábamos?
 *
 * Esto existe por "F1": `POST /api/payments/capture-order` daba el pago por aprobado cuando
 * MercadoPago no respondía, cuando el cliente no mandaba el id del pago, y aun cuando el estado era
 * "pendiente". Quien volvía de MercadoPago (o fingía volver) publicaba un trabajo, activaba una
 * membresía o dejaba plata en escrow sin haber pagado nada.
 *
 * La regla de esta función es una sola: **todo lo que falte, venga raro o no coincida es un "no"**.
 * Sólo un pago `approved`, por el monto y la moneda esperados, a nombre de quien lo reclama, es un "sí".
 * Es pura (no toca la base ni la red) para poder probarla con todos los casos feos.
 */

export type MotivoDeRechazoMp =
  /** MercadoPago todavía no lo aprobó (pendiente, en proceso, en mediación). */
  | 'pendiente'
  /** MercadoPago lo rechazó, lo canceló o lo devolvió. */
  | 'rechazado'
  /** La respuesta no trae lo necesario para decidir (estado, monto o moneda). Ante la duda, no. */
  | 'datos_incompletos'
  /** Aprobado, pero por otro monto del que esperábamos. */
  | 'monto'
  /** Aprobado, pero en otra moneda. */
  | 'moneda'
  /** Pagado en cuotas: DOAPP sólo cobra en un pago (la preferencia fija una sola cuota). */
  | 'cuotas'
  /** Pagado con un cupón o descuento de MercadoPago: lo que entra no es lo que se acordó cobrar. */
  | 'cupon'
  /** El pago pertenece a otra persona. */
  | 'ajeno';

export type VeredictoMp =
  | { ok: true; montoRecibido: number }
  | { ok: false; motivo: MotivoDeRechazoMp; detalle: string };

export interface PagoMpLeido {
  status?: unknown;
  transaction_amount?: unknown;
  currency_id?: unknown;
  /** Cantidad de cuotas en que pagó el comprador (1 = un solo pago). */
  installments?: unknown;
  /** Monto descontado por un cupón de MercadoPago (0 o ausente = sin cupón). */
  coupon_amount?: unknown;
  /** Campaña de descuento de MercadoPago aplicada (null o ausente = ninguna). */
  campaign_id?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface PagoEsperado {
  amount: unknown;
  currency: unknown;
  /** Quién reclama el pago: el usuario autenticado. */
  payerId: unknown;
}


const ESTADOS_PENDIENTES = new Set(['pending', 'in_process', 'authorized', 'in_mediation']);
const ESTADOS_RECHAZADOS = new Set(['rejected', 'cancelled', 'refunded', 'charged_back']);

const hayTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Lo que DOAPP no acepta que se haya usado para pagar: cuotas y cupones o descuentos de MercadoPago.
 *
 * Las cuotas se cierran en la preferencia (`installments: 1`, ver mercadopago.ts); los cupones NO se pueden
 * desactivar desde la preferencia (no hay un parámetro documentado), así que se detectan acá. Un pago así ya está
 * cobrado: no se rechaza ni se ejecuta, queda en revisión de una persona. Devuelve null si el pago cumple.
 */
export function condicionesNoPermitidas(leido: PagoMpLeido | null | undefined): { motivo: 'cuotas' | 'cupon'; detalle: string } | null {
  if (!leido || typeof leido !== 'object') return null;
  const cuotas = Number(leido.installments);
  if (Number.isFinite(cuotas) && cuotas > 1) {
    return { motivo: 'cuotas', detalle: `pagado en ${cuotas} cuotas (DOAPP sólo cobra en un pago)` };
  }
  const cupon = Number(leido.coupon_amount);
  const campania = leido.campaign_id;
  const hayCampania = campania !== undefined && campania !== null && String(campania).trim() !== '' && String(campania) !== '0';
  if ((Number.isFinite(cupon) && cupon > 0) || hayCampania) {
    return { motivo: 'cupon', detalle: `pagado con un cupón o descuento de MercadoPago (cupón ${Number.isFinite(cupon) ? cupon : 0}${hayCampania ? `, campaña ${String(campania)}` : ''})` };
  }
  return null;
}

export function evaluarPagoMercadoPago(
  leido: PagoMpLeido | null | undefined,
  esperado: PagoEsperado,
): VeredictoMp {
  if (!leido || typeof leido !== 'object') {
    return { ok: false, motivo: 'datos_incompletos', detalle: 'MercadoPago no devolvió el pago' };
  }

  // 1) Estado. Sólo "approved" es plata cobrada. "authorized" es una reserva sin capturar.
  if (!hayTexto(leido.status)) {
    return { ok: false, motivo: 'datos_incompletos', detalle: 'el pago no trae estado' };
  }
  const estado = leido.status.trim().toLowerCase();
  if (ESTADOS_PENDIENTES.has(estado)) {
    return { ok: false, motivo: 'pendiente', detalle: `estado ${estado}` };
  }
  if (ESTADOS_RECHAZADOS.has(estado)) {
    return { ok: false, motivo: 'rechazado', detalle: `estado ${estado}` };
  }
  if (estado !== 'approved') {
    return { ok: false, motivo: 'datos_incompletos', detalle: `estado desconocido: ${estado}` };
  }

  // 2) Monto: lo cobrado tiene que ser lo esperado. Si falta cualquiera de los dos, no se decide a favor.
  const recibido = typeof leido.transaction_amount === 'string' ? Number(leido.transaction_amount) : leido.transaction_amount;
  const esperadoNum = typeof esperado.amount === 'string' ? Number(esperado.amount) : esperado.amount;
  if (typeof recibido !== 'number' || !Number.isFinite(recibido) || recibido <= 0) {
    return { ok: false, motivo: 'datos_incompletos', detalle: 'el pago no trae un monto válido' };
  }
  if (typeof esperadoNum !== 'number' || !Number.isFinite(esperadoNum) || esperadoNum <= 0) {
    return { ok: false, motivo: 'datos_incompletos', detalle: 'el pago registrado no tiene un monto válido' };
  }
  // EXACTO: sin redondeo y sin tolerancia. Lo cobrado tiene que ser, centavo por centavo, lo que figura en el
  // pago. Un importe distinto (aunque sea por un centavo) lo decide una persona. Los dos números salen de
  // decimales escritos con dos cifras (la base devuelve "21000.00" y MercadoPago 21000), que se leen como el mismo valor.
  if (recibido !== esperadoNum) {
    return { ok: false, motivo: 'monto', detalle: `esperado ${esperadoNum}, cobrado ${recibido}` };
  }

  // 3) Moneda. Se usa `currency_id` tal cual lo manda MercadoPago, no una copia con valor por defecto.
  if (!hayTexto(leido.currency_id) || !hayTexto(esperado.currency)) {
    return { ok: false, motivo: 'datos_incompletos', detalle: 'falta la moneda' };
  }
  if (leido.currency_id.trim().toUpperCase() !== esperado.currency.trim().toUpperCase()) {
    return { ok: false, motivo: 'moneda', detalle: `esperada ${esperado.currency}, cobrada ${leido.currency_id}` };
  }

  // 3b) Cómo se pagó: en un solo pago y sin cupón ni descuento de MercadoPago.
  const condicion = condicionesNoPermitidas(leido);
  if (condicion) {
    return { ok: false, motivo: condicion.motivo, detalle: condicion.detalle };
  }

  // 4) Dueño. MercadoPago devuelve la metadata de la preferencia (con las claves en snake_case). Si trae
  //    el usuario y no es quien reclama, es el pago de otra persona. Si no lo trae, no se puede afirmar
  //    nada en contra: la defensa es el monto exacto y que el id de pago no se pueda reutilizar.
  const meta = leido.metadata && typeof leido.metadata === 'object' ? leido.metadata : {};
  const duenio = meta['user_id'] ?? meta['userId'];
  if (duenio !== undefined && duenio !== null && String(duenio) !== '' && String(duenio) !== String(esperado.payerId)) {
    return { ok: false, motivo: 'ajeno', detalle: 'el pago es de otro usuario' };
  }

  return { ok: true, montoRecibido: recibido };
}

/**
 * Un id de pago de MercadoPago es un número de pocos dígitos. Se valida antes de usarlo en una consulta:
 * viene del cliente y termina dentro de la URL que se le pide a MercadoPago.
 */
export function esIdDePagoMp(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{3,20}$/.test(valor.trim());
}

/**
 * Tipos de pago que confirma `capture-order` cuando el comprador vuelve a DOAPP. El aviso automático de MercadoPago
 * (webhook) NO los procesa ni con la llave encendida: si llegara primero (llega a los segundos) los dejaría en
 * revisión y al volver el comprador vería un error aunque pagó. El webhook sólo guarda su vínculo (el id de MercadoPago).
 */
export const TIPOS_QUE_CONFIRMA_EL_RETORNO: readonly string[] = ['job_publication', 'membership', 'budget_increase'];

/** Estados desde los que `capture-order` puede completar un pago. Cualquier otro ya se procesó o terminó. */
export const ESTADOS_CAPTURABLES = ['pending', 'processing'] as const;
/** Estados de un pago que ya se procesó bien: repetir la confirmación no hace nada y responde igual. */
export const ESTADOS_YA_PROCESADOS = ['completed', 'held_escrow', 'awaiting_confirmation'] as const;
