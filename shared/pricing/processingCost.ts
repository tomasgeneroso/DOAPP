/**
 * Costo de procesamiento de la pasarela de pago.
 *
 * Quien paga que, y por que:
 *
 *   Cliente     comision de DOAPP + su IVA
 *   Trabajador  el costo de la pasarela
 *
 * Cada cargo tiene una explicacion que se entiende sola: DOAPP le cobra al
 * cliente por conectarlo y garantizarle el trabajo; la pasarela le cobra al que
 * recibe la plata, que es como funciona en todos lados (los comercios pagan la
 * tarjeta, no el comprador).
 *
 * El IVA viaja con la comision y no se puede separar: es el impuesto sobre ESE
 * servicio y sigue a la factura. Si se le factura la comision al cliente, el
 * IVA lo paga el cliente. No es una preferencia, es como funciona el impuesto.
 *
 * Consecuencia practica: el cliente paga exactamente trabajo + comision + IVA,
 * sin recargos escondidos, y el costo de la pasarela se descuenta de lo que
 * recibe el trabajador. La plataforma se queda con la comision limpia.
 */

/**
 * Tarifas reales de la cuenta de DOAPP, confirmadas por Mercado Pago en agosto
 * de 2026. Valen igual para tarjeta de credito y de debito -- el mix entre una
 * y otra no cambia el costo.
 *
 * El plazo es el de liberacion del dinero: cuanto antes queda disponible, mas
 * caro. Y no es solo una cuestion de costo: con plazos largos no se puede pagar
 * al trabajador ni reembolsar al cliente hasta que el dinero se libere, porque
 * ambas operaciones exigen saldo disponible.
 */
export const MP_FEE_BY_RELEASE_DAYS: Record<number, { base: number; withVat: number }> = {
  0: { base: 0.0629, withVat: 0.0761 },
  10: { base: 0.0439, withVat: 0.0531 },
  18: { base: 0.0339, withVat: 0.041 },
  35: { base: 0.0149, withVat: 0.018 },
};

/**
 * Lo que cobra la pasarela, como fraccion del total cobrado, IVA incluido.
 *
 * Se lee del entorno para poder corregirlo sin recompilar: la tarifa cambia si
 * se cambia el plazo de liberacion en el panel, o si se negocia por volumen.
 * Tiene que coincidir con lo que dice el panel.
 *
 * El default es acreditacion inmediata, el tramo mas caro. Es a proposito: si
 * el valor real fuera menor se cobra de mas y alguien lo reclama enseguida; si
 * fuera al reves se pierde plata en silencio, que es el error que no se detecta.
 */
export function getProcessingFeeRate(): number {
  const raw = typeof process !== 'undefined' ? process.env?.PAYMENT_PROCESSING_FEE_RATE : undefined;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0 && parsed < 0.5) return parsed;
  return MP_FEE_BY_RELEASE_DAYS[0].withVat;
}

export interface FeeSplit {
  /** El precio del trabajo, lo que el trabajador cotizo. */
  jobPrice: number;
  /** Comision de DOAPP. */
  commission: number;
  /** IVA sobre la comision. Viaja con ella. */
  vat: number;
  /** Lo que paga el cliente: trabajo + comision + IVA. Sin recargos escondidos. */
  clientPays: number;
  /** Lo que cobra la pasarela, calculado sobre el total cobrado. */
  processingCost: number;
  /** Lo que le queda al trabajador: el precio menos la pasarela. */
  workerReceives: number;
  /** Lo que le queda a la plataforma: comision + IVA, limpio. */
  platformKeeps: number;
  /** La tarifa usada, para mostrarla y auditarla. */
  rate: number;
}

/**
 * Reparte una operacion entre las tres partes.
 *
 * La cuenta cierra sola y conviene verla escrita, porque es la que hay que
 * poder defender ante un reclamo:
 *
 *   cliente paga        trabajo + comision + IVA
 *   la pasarela cobra   tarifa x (lo que pago el cliente)
 *   el trabajador cobra trabajo - lo de la pasarela
 *   a DOAPP le queda    comision + IVA
 *
 * Con trabajo 40.000, comision 8% y tarifa 5,31%:
 *   cliente     43.872
 *   pasarela    -2.330
 *   trabajador  37.670
 *   DOAPP        3.872  = 3.200 de comision + 672 de IVA
 *
 * Ya no hace falta el "grossing up" que habia antes: como el costo de la
 * pasarela sale del lado del trabajador y no se le suma al cliente, el total
 * cobrado es exactamente trabajo + comision + IVA, sin despejar nada.
 */
export function splitFees(
  jobPrice: number,
  commission: number,
  vat: number,
  rate: number = getProcessingFeeRate(),
): FeeSplit {
  const price = Math.max(0, Number(jobPrice) || 0);
  const comm = Math.max(0, Number(commission) || 0);
  const tax = Math.max(0, Number(vat) || 0);

  const clientPays = round2(price + comm + tax);
  const processingCost = rate > 0 ? round2(clientPays * rate) : 0;

  return {
    jobPrice: round2(price),
    commission: round2(comm),
    vat: round2(tax),
    clientPays,
    processingCost,
    // Nunca negativo: en un trabajo muy chico la tarifa podria comerse todo, y
    // mostrar un numero negativo seria peor que mostrar cero. El minimo de
    // contrato existe justamente para que este caso no llegue a pasar.
    workerReceives: round2(Math.max(0, price - processingCost)),
    platformKeeps: round2(comm + tax),
    rate,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Texto unico para las dos apps, asi no se explica distinto en cada pantalla. */
export const PROCESSING_COST_LABEL = 'Costo de procesamiento';

export const PROCESSING_COST_HELP =
  'Es lo que cobra la pasarela de pago por procesar la transacción. No es una comisión de DOAPP: se traslada tal cual, sin recargo.';
