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

import { POLITICAS } from '../constants/policies.js';

/**
 * Tarifas de la cuenta de DOAPP tal como las muestra el panel de Mercado Pago
 * (Tu negocio → Costos → Tarjeta de credito), leidas el 2026-09-17. El panel
 * ofrece solo tres plazos para esta cuenta: al instante, 5 y 10 dias. Los de
 * 18 y 35 que figuraban antes no estan disponibles.
 *
 * `base` es lo que muestra el panel; `withVat` es lo que efectivamente se
 * descuenta (+21%). El plazo es el de liberacion del dinero: cuanto antes queda
 * disponible, mas caro. Y no es solo costo: mientras esta "a liberar" no se
 * puede pagar al trabajador ni reembolsar por MP sin saldo de otras operaciones.
 *
 * Esta tabla es una referencia. El descuento real al trabajador debe salir de
 * `fee_details` del pago aprobado (lo que MP cobro de verdad en ESA operacion),
 * no de aca: el cliente elige el medio en el checkout y la tarifa cambia con
 * el medio.
 */
export const MP_FEE_BY_RELEASE_DAYS: Record<number, { base: number; withVat: number }> = {
  0: { base: 0.0599, withVat: 0.0725 },
  5: { base: 0.0519, withVat: 0.0628 },
  10: { base: 0.0419, withVat: 0.0507 },
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

export interface DesgloseCancelacion {
  /** Lo que el cliente pagó en total. */
  pagado: number;
  /** Precio del trabajo, sin comisión ni IVA. */
  precioTrabajo: number;
  comision: number;
  iva: number;
  /** Lo que se llevó la pasarela y no vuelve. */
  costoPasarela: number;
  /** Lo que se le devuelve al cliente. */
  devolver: number;
  /** Lo que no vuelve al cliente. */
  retiene: number;
}

/**
 * Qué se devuelve cuando un trabajo se cancela ANTES de que un admin apruebe la
 * publicación (T&C 9.1): el precio y la parte de la comisión que la política
 * no retiene, menos la pasarela.
 *
 * El costo de la pasarela no vuelve. Es la parte que la gente no espera y la
 * que hay que decir de frente: MercadoPago cobra por procesar el pago y ese
 * cobro ya ocurrió; devolver el dinero es una segunda operación, no un
 * "deshacer". Si la plataforma lo absorbiera, publicar-y-cancelar sería gratis
 * para el cliente y una pérdida directa para DOAPP en cada vuelta.
 *
 * Es una vista del caso particular de liquidarCancelacion (la función general,
 * que decide la regla). No calcula nada por su cuenta: si las dos dijeran
 * cosas distintas volveríamos al problema que esto vino a resolver.
 */
export function desgloseCancelacionSinContratar(
  pagado: number,
  comision: number,
  iva: number,
  rate = getProcessingFeeRate(),
): DesgloseCancelacion {
  const total = round2(Math.max(0, pagado));
  const comm = round2(Math.max(0, comision));
  const tax = round2(Math.max(0, iva));
  const precioTrabajo = round2(Math.max(0, total - comm - tax));

  const liq = liquidarCancelacion({
    precio: precioTrabajo, comision: comm, iva: tax,
    aprobada: false, hayTrabajador: false, tardia: false, rate,
  });

  return {
    pagado: total,
    precioTrabajo,
    comision: comm,
    iva: tax,
    costoPasarela: liq.costoPasarela,
    devolver: liq.aCliente,
    retiene: round2(total - liq.aCliente),
  };
}

export interface LiquidacionCancelacion {
  /** Lo que la pasarela ya se llevo y no vuelve: tarifa x total cobrado. */
  costoPasarela: number;
  /**
   * Comision + IVA que retiene la plataforma. Antes de la aprobacion, solo la
   * parte que fija CANCELACION_EN_REVISION_PARTE_COMISION.
   */
  retieneApp: number;
  /** Lo que vuelve al cliente, como saldo a favor. */
  aCliente: number;
  /** Lo que se le paga al trabajador por el dia que reservo. */
  aTrabajador: number;
  /** Por que salio asi, para mostrarlo y para el expediente. */
  regla: 'antes_de_aprobar' | 'sin_trabajador' | 'con_tiempo' | 'tardia_con_trabajador';
}

/**
 * Como se reparte la plata cuando se cancela. Una sola funcion para los dos
 * caminos que la mueven (el cliente cancela la publicacion; un admin aprueba la
 * cancelacion de un contrato), asi no vuelven a decir cosas distintas.
 *
 * Tres reglas, en este orden:
 *
 *   1. La pasarela no la paga la plataforma. Mercado Pago ya cobro por
 *      procesar el pago y eso no vuelve; lo absorbe quien recibe el dinero.
 *      Si el dinero queda como saldo dentro de la app no hay un segundo costo;
 *      si despues se retira a un CBU, ese costo lo paga quien retira (T&C 7.9).
 *
 *   2. La comision no se devuelve una vez aprobada la publicacion (T&C 7.5):
 *      aprobar y publicar tiene un costo para la plataforma que ya se gasto.
 *      Si todavia no fue aprobada (T&C 9.1) se retiene solo una parte
 *      (CANCELACION_EN_REVISION_PARTE_COMISION) y el resto vuelve.
 *
 *   3. Con menos de CANCELACION_CLIENTE_HORAS_ANTES y un trabajador
 *      seleccionado, la mitad del precio (ya sin la pasarela) es para el
 *      trabajador: reservo el dia y lo perdio (T&C 9.3).
 *
 * Todo lo que va al cliente va como saldo a favor. Es lo que permite que no
 * haya un segundo costo de pasarela: la plata no sale de la plataforma.
 */
export function liquidarCancelacion(args: {
  precio: number;
  comision: number;
  iva: number;
  /** Si un admin ya aprobo la publicacion. */
  aprobada: boolean;
  /** Si habia un trabajador seleccionado. */
  hayTrabajador: boolean;
  /** Si faltan menos de las horas de la politica, o el trabajo ya empezo. */
  tardia: boolean;
  parteTrabajador?: number;
  /** Solo para tests; en produccion sale de POLITICAS. */
  parteComisionEnRevision?: number;
  rate?: number;
}): LiquidacionCancelacion {
  const precio = round2(Math.max(0, Number(args.precio) || 0));
  const comision = round2(Math.max(0, Number(args.comision) || 0));
  const iva = round2(Math.max(0, Number(args.iva) || 0));
  const rate = args.rate ?? getProcessingFeeRate();
  const parte = args.parteTrabajador ?? 0.5;

  const totalCobrado = round2(precio + comision + iva);
  const costoPasarela = rate > 0 ? round2(totalCobrado * rate) : 0;

  if (!args.aprobada) {
    // Nadie aprobo, nadie trabajo: vuelve el precio y la parte de la comision
    // que la politica no retiene. La pasarela ya se la llevo Mercado Pago.
    const parteRevision = args.parteComisionEnRevision ?? POLITICAS.CANCELACION_EN_REVISION_PARTE_COMISION;
    const retieneApp = round2((comision + iva) * parteRevision);
    return {
      costoPasarela,
      retieneApp,
      aCliente: round2(Math.max(0, totalCobrado - costoPasarela - retieneApp)),
      aTrabajador: 0,
      regla: 'antes_de_aprobar',
    };
  }

  const retieneApp = round2(comision + iva);
  const bolsa = round2(Math.max(0, precio - costoPasarela));

  if (!args.hayTrabajador) {
    return { costoPasarela, retieneApp, aCliente: bolsa, aTrabajador: 0, regla: 'sin_trabajador' };
  }
  if (!args.tardia) {
    return { costoPasarela, retieneApp, aCliente: bolsa, aTrabajador: 0, regla: 'con_tiempo' };
  }

  const aTrabajador = round2(bolsa * parte);
  return {
    costoPasarela,
    retieneApp,
    aCliente: round2(bolsa - aTrabajador),
    aTrabajador,
    regla: 'tardia_con_trabajador',
  };
}

/** Texto unico para las dos apps, asi no se explica distinto en cada pantalla. */
export const PROCESSING_COST_LABEL = 'Costo de procesamiento';

export const PROCESSING_COST_HELP =
  'Es lo que cobra la pasarela de pago por procesar la transacción. No es una comisión de DOAPP: se traslada tal cual, sin recargo.';
