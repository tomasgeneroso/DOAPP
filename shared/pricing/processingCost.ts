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
 *
 * El IVA de la pasarela es otra cosa. Mercado Pago le cobra a DOAPP su tarifa
 * MAS el IVA de esa tarifa (4,19% + 21% = 5,07%). Ese IVA lo factura MP a
 * DOAPP, y DOAPP -- responsable inscripto, que ya le cobra IVA al cliente sobre
 * su comision -- lo toma como credito fiscal contra ese IVA que debe. O sea:
 * no es un costo de DOAPP, es plata que vuelve al liquidar impuestos. Por eso
 * al trabajador (y al cliente que cancela) se les traslada la tarifa SIN IVA:
 * trasladar el IVA y ademas tomar el credito seria cobrar dos veces lo mismo.
 */

import { POLITICAS } from '../constants/policies.js';

/** IVA argentino. Se aplica sobre la tarifa de MP y sobre la comision de DOAPP. */
export const IVA = 0.21;

/**
 * La tarifa de MP sin su IVA, a partir del importe con IVA que MP descuenta
 * (fee_details / net_received_amount vienen con IVA incluido).
 */
export function pasarelaSinIva(conIva: number): number {
  return round2(Math.max(0, Number(conIva) || 0) / (1 + IVA));
}

/**
 * Tarifas de la cuenta de DOAPP tal como las muestra el panel de Mercado Pago
 * (Tu negocio → Costos → Tarjeta de credito), leidas el 2026-09-17. El panel
 * ofrece solo tres plazos para esta cuenta: al instante, 5 y 10 dias. Los de
 * 18 y 35 que figuraban antes no estan disponibles.
 *
 * `base` es lo que muestra el panel y lo que se traslada al trabajador;
 * `withVat` es lo que MP efectivamente descuenta de la cuenta (+21%), y la
 * diferencia es el credito fiscal de DOAPP. El plazo es el de liberacion del
 * dinero: cuanto antes queda disponible, mas caro. Y no es solo costo: mientras
 * esta "a liberar" no se puede pagar al trabajador ni reembolsar por MP sin
 * saldo de otras operaciones.
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
 * Lo que cobra la pasarela, como fraccion del total cobrado, SIN IVA: es lo
 * que se traslada al trabajador. El IVA de la tarifa es credito fiscal de
 * DOAPP (ver arriba), no se traslada.
 *
 * Se lee del entorno para poder corregirlo sin recompilar: la tarifa cambia si
 * se cambia el plazo de liberacion en el panel, o si se negocia por volumen.
 * Tiene que coincidir con lo que dice el panel, tal cual (el panel ya la
 * muestra sin IVA).
 *
 * El default es acreditacion inmediata, el tramo mas caro. Es a proposito: si
 * el valor real fuera menor se cobra de mas y alguien lo reclama enseguida; si
 * fuera al reves se pierde plata en silencio, que es el error que no se detecta.
 */
export function getProcessingFeeRate(): number {
  const raw = typeof process !== 'undefined' ? process.env?.PAYMENT_PROCESSING_FEE_RATE : undefined;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0 && parsed < 0.5) return parsed;
  return MP_FEE_BY_RELEASE_DAYS[0].base;
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
 * Qué recibiría en efectivo el cliente si cancela ANTES de que un admin apruebe
 * la publicación y retira el saldo (T&C 9.1): el total menos la mitad de la
 * comisión y menos la pasarela. Si en cambio deja el saldo en la app, recupera
 * el total (liq.aCliente) y no paga nada.
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

  // "devolver" es lo que recibiria en efectivo si retira; "retiene" lo que
  // queda en la plataforma en ese caso. Como saldo dentro de la app recupera
  // el total (liq.aCliente).
  const retiene = round2(liq.alRetirar.comision + liq.alRetirar.pasarela);
  return {
    pagado: total,
    precioTrabajo,
    comision: comm,
    iva: tax,
    costoPasarela: liq.costoPasarela,
    devolver: round2(Math.max(0, liq.aCliente - retiene)),
    retiene,
  };
}

export interface LiquidacionCancelacion {
  /**
   * Lo que la pasarela cobro por la operacion, SIN IVA (el IVA es credito
   * fiscal de DOAPP): tarifa x total cobrado. Lo absorbe quien termina
   * recibiendo la plata, y solo cuando la recibe en efectivo.
   */
  costoPasarela: number;
  /**
   * Comision + IVA que retiene la plataforma EN EL ACTO. Solo cuando ya habia
   * un trabajador seleccionado: la intermediacion ocurrio. Sin trabajador la
   * comision vuelve como saldo, y se retiene una parte solo si el cliente
   * retira ese saldo (ver alRetirar).
   */
  retieneApp: number;
  /**
   * Lo que se acredita al cliente como saldo a favor, bruto: sin descontar la
   * pasarela ni la retencion. Usarlo dentro de la app no cuesta nada.
   */
  aCliente: number;
  /** Lo que se le paga al trabajador por el dia que reservo, ya neto de su pasarela. */
  aTrabajador: number;
  /**
   * Lo que se retiene si el cliente RETIRA ese saldo a efectivo: la parte de
   * la comision que fija la politica (solo sin trabajador) y la pasarela que
   * le corresponde. Va en la metadata del credito para que el retiro lo lea.
   */
  alRetirar: { comision: number; pasarela: number };
  /** Por que salio asi, para mostrarlo y para el expediente. */
  regla: 'antes_de_aprobar' | 'sin_trabajador' | 'con_tiempo' | 'tardia_con_trabajador';
}

/**
 * Como se reparte la plata cuando se cancela. Una sola funcion para los dos
 * caminos que la mueven (el cliente cancela la publicacion; un admin aprueba la
 * cancelacion de un contrato), asi no vuelven a decir cosas distintas.
 *
 * La idea de fondo: la plata que se queda en la app no cuesta nada; la que sale
 * a efectivo paga lo que costo moverla. Por eso la liquidacion tiene dos
 * momentos: lo que se acredita ahora (aCliente, aTrabajador, retieneApp) y lo
 * que se retiene si el cliente retira (alRetirar).
 *
 *   1. Sin trabajador seleccionado -- antes o despues de la aprobacion --
 *      el cliente recupera TODO lo que pago como saldo a favor. Puede
 *      republicar sin pagar de nuevo. Si en cambio retira ese saldo, se le
 *      retiene la mitad de la comision (CANCELACION_EN_REVISION_PARTE_COMISION,
 *      con su IVA) por la revision que ya se hizo, y la pasarela. T&C 9.1/9.2.
 *
 *   2. Con trabajador seleccionado, la comision se retiene en el acto: la
 *      intermediacion ocurrio (T&C 7.5). El precio vuelve como saldo; si lo
 *      retira, paga la pasarela.
 *
 *   3. Con trabajador y menos de CANCELACION_CLIENTE_HORAS_ANTES, la mitad del
 *      precio es del trabajador (reservo el dia y lo perdio, T&C 9.3), neta de
 *      su parte de la pasarela porque se le paga en efectivo. La otra mitad
 *      vuelve al cliente como saldo, con su parte de la pasarela pendiente
 *      para el retiro.
 *
 * La pasarela nunca la paga la plataforma y nunca se cobra dos veces: cada
 * peso de tarifa tiene un unico destinatario que la absorbe, cuando cobra.
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
  /** Tarifa SIN IVA. Por defecto la configurada. */
  rate?: number;
}): LiquidacionCancelacion {
  const precio = round2(Math.max(0, Number(args.precio) || 0));
  const comision = round2(Math.max(0, Number(args.comision) || 0));
  const iva = round2(Math.max(0, Number(args.iva) || 0));
  const rate = args.rate ?? getProcessingFeeRate();
  const parte = args.parteTrabajador ?? 0.5;
  const parteRevision = args.parteComisionEnRevision ?? POLITICAS.CANCELACION_EN_REVISION_PARTE_COMISION;

  const totalCobrado = round2(precio + comision + iva);
  const costoPasarela = rate > 0 ? round2(totalCobrado * rate) : 0;

  if (!args.hayTrabajador) {
    // Nadie trabajo: vuelve todo como saldo. Retirarlo cuesta media comision
    // (la revision se hizo igual) y la pasarela.
    return {
      costoPasarela,
      retieneApp: 0,
      aCliente: totalCobrado,
      aTrabajador: 0,
      alRetirar: { comision: round2((comision + iva) * parteRevision), pasarela: costoPasarela },
      regla: args.aprobada ? 'sin_trabajador' : 'antes_de_aprobar',
    };
  }

  const retieneApp = round2(comision + iva);

  if (!args.tardia) {
    return {
      costoPasarela,
      retieneApp,
      aCliente: precio,
      aTrabajador: 0,
      alRetirar: { comision: 0, pasarela: costoPasarela },
      regla: 'con_tiempo',
    };
  }

  const brutoTrabajador = round2(precio * parte);
  const pasarelaTrabajador = round2(costoPasarela * parte);
  return {
    costoPasarela,
    retieneApp,
    aCliente: round2(precio - brutoTrabajador),
    aTrabajador: round2(Math.max(0, brutoTrabajador - pasarelaTrabajador)),
    alRetirar: { comision: 0, pasarela: round2(costoPasarela - pasarelaTrabajador) },
    regla: 'tardia_con_trabajador',
  };
}

/** Texto unico para las dos apps, asi no se explica distinto en cada pantalla. */
export const PROCESSING_COST_LABEL = 'Costo de procesamiento';

export const PROCESSING_COST_HELP =
  'Es lo que cobra la pasarela de pago por procesar la transacción. No es una comisión de DOAPP: se traslada tal cual, sin recargo.';
