/**
 * Costo de procesamiento de la pasarela de pago.
 *
 * Quien paga que, y por que:
 *
 *   Cliente     precio + comision de DOAPP + costo de procesamiento + IVA de los dos
 *   Trabajador  el precio, entero
 *   DOAPP       la comision (el procesamiento entra y sale: cubre lo que cobra MP)
 *
 * El costo de procesamiento es UNA tasa, la misma con cualquier medio de pago.
 * No es la tarifa real de cada medio (credito, debito, dinero en cuenta cobran
 * distinto) porque eso no se sabe hasta que el cliente elige adentro del
 * checkout, cuando el total ya esta fijado; y porque cobrar distinto segun
 * como se paga es exactamente lo que la ley de tarjetas mira con lupa. Una
 * sola tasa, informada antes de pagar, igual para todos.
 *
 * La tasa se fija a la tarifa MAS ALTA que cobra MP (tarjeta de credito). Con
 * medios mas baratos DOAPP se queda con la diferencia; con credito queda en
 * cero. Nunca pierde.
 *
 * Por que el cliente y no el trabajador (que es como estaba antes):
 *
 *   - El trabajador cobra lo que dice el precio. Sin "recibis entre X e Y
 *     segun como pague el cliente", sin descuentos que no controla. Es el
 *     lado escaso del mercado y es el que compara contra el efectivo.
 *   - El costo se liquida cuando ocurre. MP cobra al ENTRAR el pago, una sola
 *     vez; transferir a un CBU es gratis. Cargarselo al cliente en ese momento
 *     lo deja pagado y no hay que arrastrarlo por cancelaciones, devoluciones
 *     parciales, retiros y contratos con varios trabajadores. Cada uno de esos
 *     arrastres era un lugar donde la cuenta podia no cerrar.
 *
 * Consecuencia para las cancelaciones: el costo de procesamiento NO se
 * devuelve, nunca. Es plata que ya se fue a MP cuando el cliente pago, como el
 * cargo por servicio de una entrada. Lo demas (precio, comision) sigue las
 * reglas de siempre (liquidarCancelacion). Retirar saldo a un CBU no tiene
 * costo de pasarela; solo la parte de comision que fija la politica cuando la
 * publicacion se cancelo sin trabajador.
 *
 * El IVA. DOAPP es responsable inscripto: factura con IVA su comision y su
 * costo de procesamiento. MP le factura a DOAPP su tarifa MAS IVA (4,19% +
 * 21% = 5,07%), y ese IVA es credito fiscal contra el que DOAPP cobro. Como el
 * procesamiento cobrado equivale a la tarifa de MP, su IVA se cancela con el
 * credito: DOAPP termina girando solo el IVA de la comision. Por eso el
 * procesamiento lleva IVA en la factura y sin embargo no le cuesta nada a
 * DOAPP ni le deja credito parado.
 */

import { POLITICAS } from '../constants/policies.js';

/** IVA argentino. Se aplica sobre la comision, sobre el procesamiento y sobre la tarifa de MP. */
export const IVA = 0.21;

/**
 * Error de una cuenta de dinero. Tiene su propio tipo para que las rutas lo
 * puedan distinguir de "se cayo la base" y contestar 400 con el motivo en vez
 * de un 500 mudo.
 */
export class ErrorDeCalculo extends Error {
  constructor(message: string, readonly detalle?: Record<string, unknown>) {
    super(message);
    this.name = 'ErrorDeCalculo';
  }
}

/**
 * Un importe que entra a una cuenta. Todo lo que llega de afuera --
 * `DECIMAL` de Postgres (que Sequelize devuelve como string), un body de
 * request, una variable de entorno -- pasa por aca.
 *
 * NaN, Infinity, null y negativos se convierten en 0 en vez de propagarse:
 * un NaN se contagia a toda la suma y aparece recien en la pantalla del
 * usuario como "$NaN", o peor, como un `amount` que MercadoPago rechaza sin
 * decir por que. Cero es incorrecto pero acotado y visible.
 *
 * El tope existe porque un importe absurdo casi siempre es un bug de unidades
 * (centavos tomados como pesos) y es mejor que falle la cuenta y no que se
 * cree una orden de pago por mil millones.
 */
const TOPE_IMPORTE = 1_000_000_000;

export function importeValido(v: unknown, nombre = 'importe'): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  if (v === null || v === undefined || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > TOPE_IMPORTE) {
    throw new ErrorDeCalculo(`El ${nombre} supera el máximo admitido`, { valor: n, tope: TOPE_IMPORTE });
  }
  return n;
}

/**
 * La tasa maxima que admite el despeje del procesamiento. Arriba de
 * 1/(1+IVA) = 82,6% el denominador se hace cero o negativo y la cuenta
 * devuelve un cargo negativo o infinito. Nunca va a pasar con una tarifa real
 * (la mas cara de MP es 5,99%), pero es la clase de dato que llega mal desde
 * una variable de entorno mal escrita (0.0419 vs 4.19) y no puede terminar en
 * un cobro.
 */
const RATE_MAXIMA = 0.5;

/**
 * Una proporcion de reparto (la mitad al trabajador, media comision). Fuera
 * de 0..1 no significa nada y repartiria mas de lo que hay: es preferible que
 * falle la liquidacion a que acredite de mas y despues haya que pedirlo.
 */
function proporcionValida(v: unknown, nombre: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new ErrorDeCalculo(`La ${nombre} tiene que estar entre 0 y 1`, { valor: v });
  }
  return n;
}

function rateValida(rate: unknown): number {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) {
    throw new ErrorDeCalculo('La tasa de procesamiento no es un número válido', { valor: rate });
  }
  if (n >= RATE_MAXIMA) {
    throw new ErrorDeCalculo(
      'La tasa de procesamiento es demasiado alta: revisá PAYMENT_PROCESSING_FEE_RATE (se escribe como fracción: 0.0419, no 4.19)',
      { valor: n, maxima: RATE_MAXIMA },
    );
  }
  return n;
}

/**
 * La tarifa de MP sin su IVA, a partir del importe con IVA que MP descuenta
 * (fee_details / net_received_amount vienen con IVA incluido). Sirve para la
 * conciliacion: comparar lo que MP cobro de verdad con lo que se le cobro al
 * cliente por procesamiento.
 */
export function pasarelaSinIva(conIva: number): number {
  return round2(Math.max(0, Number(conIva) || 0) / (1 + IVA));
}

/**
 * Tarifas de la cuenta de DOAPP tal como las muestra el panel de Mercado Pago
 * (Tu negocio → Costos → Tarjeta de credito), leidas el 2026-09-17. El panel
 * ofrece solo tres plazos para esta cuenta: al instante, 5 y 10 dias.
 *
 * `base` es lo que muestra el panel (sin IVA); `withVat` es lo que MP
 * efectivamente descuenta de la cuenta (+21%), y la diferencia es el credito
 * fiscal de DOAPP. El plazo es el de liberacion del dinero: cuanto antes queda
 * disponible, mas caro.
 *
 * Es una referencia. La tasa que se cobra al cliente sale del entorno
 * (getProcessingFeeRate) y tiene que ser la MAS ALTA de los medios habilitados.
 */
export const MP_FEE_BY_RELEASE_DAYS: Record<number, { base: number; withVat: number }> = {
  0: { base: 0.0599, withVat: 0.0725 },
  5: { base: 0.0519, withVat: 0.0628 },
  10: { base: 0.0419, withVat: 0.0507 },
};

/**
 * La tasa de procesamiento que se le cobra al cliente, SIN IVA, como fraccion
 * del total cobrado. Una sola para todos los medios (ver arriba).
 *
 * Se lee del entorno para poder corregirla sin recompilar: cambia si se cambia
 * el plazo de liberacion en el panel o si se negocia por volumen. Tiene que
 * ser igual o mayor que la tarifa mas alta que MP cobra por cualquier medio
 * habilitado (hoy, tarjeta de credito); si fuera menor, DOAPP paga la
 * diferencia en silencio en cada operacion con credito.
 *
 * El default es acreditacion inmediata, el tramo mas caro. A proposito: si el
 * valor real fuera menor se cobra de mas y alguien lo reclama enseguida; si
 * fuera al reves se pierde plata en silencio, que es el error que no se detecta.
 */
export function getProcessingFeeRate(): number {
  const raw = typeof process !== 'undefined' ? process.env?.PAYMENT_PROCESSING_FEE_RATE : undefined;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0 && parsed < 0.5) return parsed;
  return MP_FEE_BY_RELEASE_DAYS[0].base;
}

export interface Procesamiento {
  /** Lo que se le cobra al cliente por procesamiento, sin IVA. */
  cargo: number;
  /** IVA sobre ese cargo. */
  iva: number;
  /** cargo + iva: lo que suma al total. */
  total: number;
  /** La tasa usada, para mostrarla y auditarla. */
  rate: number;
}

/**
 * Cuanto hay que sumar a un importe para que, cobrado por la pasarela, la
 * tarifa de la pasarela quede cubierta por lo que se sumo. Es un despeje, no
 * una suma: la tarifa se aplica sobre el TOTAL cobrado, procesamiento
 * incluido, asi que hay que resolver
 *
 *   cargo = rate x (base + cargo x (1 + IVA))
 *   cargo = rate x base / (1 - rate x (1 + IVA))
 *
 * Con base 40.356 y 4,19%: cargo 1.781,21, IVA 374,05, total 42.511,26. La
 * tarifa de MP sobre 42.511,26 es 1.781,22: cubierta al centavo.
 */
export function procesamientoParaCobrar(base: number, rate: number = getProcessingFeeRate()): Procesamiento {
  const b = importeValido(base, 'importe a procesar');
  const r = rateValida(rate);
  if (r === 0 || b === 0) return { cargo: 0, iva: 0, total: 0, rate: r };

  const cargo = round2((b * r) / (1 - r * (1 + IVA)));
  const iva = round2(cargo * IVA);

  // La comprobacion de la propia cuenta: la tarifa que MP va a cobrar sobre el
  // total tiene que quedar cubierta por lo que se cobro. Si esto no se cumple
  // el despeje esta mal y cada operacion pierde plata en silencio, que es
  // justo el error que no se detecta hasta que no cierra el mes.
  const totalCobrado = b + cargo + iva;
  if (!Number.isFinite(cargo) || cargo < 0 || totalCobrado * r > cargo + 0.02) {
    throw new ErrorDeCalculo('El costo de procesamiento no cubre la tarifa de la pasarela', {
      base: b, rate: r, cargo, totalCobrado,
    });
  }

  return { cargo, iva, total: round2(cargo + iva), rate: r };
}

export interface FeeSplit {
  /** El precio del trabajo, lo que el trabajador cotizo. */
  jobPrice: number;
  /** Comision de DOAPP, sin IVA. */
  commission: number;
  /** IVA sobre la comision. */
  vat: number;
  /** Costo de procesamiento que paga el cliente, sin IVA. */
  processingCharge: number;
  /** IVA sobre el procesamiento. */
  processingVat: number;
  /** IVA total de la factura: sobre la comision y sobre el procesamiento. */
  totalVat: number;
  /** Lo que paga el cliente: precio + comision + procesamiento + IVA de los dos. */
  clientPays: number;
  /** Lo que se espera que MP cobre de verdad (sin IVA), a la tasa configurada, sobre el total. */
  processingCost: number;
  /** El IVA de esa tarifa de MP: credito fiscal de DOAPP. */
  processingCostVat: number;
  /** Lo que cobra el trabajador: el precio, entero. */
  workerReceives: number;
  /**
   * Lo que le queda a DOAPP en caja despues de que MP descuenta su tarifa con
   * IVA: comision + IVA de la comision (mas centavos de redondeo). Es el
   * residuo, asi la cuenta cierra al centavo: clientPays = workerReceives +
   * processingCost + processingCostVat + platformKeeps.
   */
  platformKeeps: number;
  /** La tasa de procesamiento usada. */
  rate: number;
}

/**
 * Reparte una operacion entre las tres partes.
 *
 * La cuenta, escrita, porque es la que hay que poder defender ante un reclamo
 * (trabajo 36.000, comision 10% y procesamiento 4,19%):
 *
 *   precio                         36.000,00
 *   comision DOAPP (10%)            3.600,00
 *   procesamiento (4,19%)           1.781,21
 *   IVA 21% (comision + proc.)      1.130,05
 *   cliente paga                   42.511,26
 *
 *   MP se lleva (4,19% + IVA)      -2.155,27   = 1.781,22 + 374,05
 *   trabajador cobra               36.000,00
 *   a DOAPP le queda                4.355,99   = comision + su IVA
 *
 * Y DOAPP gira de IVA 1.130,05 - 374,05 (credito de MP) = 756: el IVA de la
 * comision. El procesamiento entro y salio.
 */
export function splitFees(
  jobPrice: number,
  commission: number,
  vat: number,
  rate: number = getProcessingFeeRate(),
): FeeSplit {
  const price = importeValido(jobPrice, 'precio');
  const comm = importeValido(commission, 'comisión');
  const tax = importeValido(vat, 'IVA');

  const base = round2(price + comm + tax);
  const proc = procesamientoParaCobrar(base, rate);
  const clientPays = round2(base + proc.total);
  const processingCost = proc.rate > 0 ? round2(clientPays * proc.rate) : 0;
  const processingCostVat = round2(processingCost * IVA);

  // Lo que le queda a la plataforma es el residuo del reparto, asi que la
  // cuenta cierra por construccion. Lo que hay que verificar es que ese
  // residuo sea lo que tiene que ser: la comision con su IVA, ni mas ni
  // menos. Si el despeje del procesamiento se rompe, acá se nota -- y frena
  // antes de cobrar, en vez de aparecer como una diferencia al cierre del mes.
  const platformKeeps = round2(clientPays - price - processingCost - processingCostVat);
  if (Math.abs(platformKeeps - (comm + tax)) > 0.05) {
    throw new ErrorDeCalculo('Lo que retiene la plataforma no coincide con la comisión y su IVA', {
      platformKeeps, comision: comm, iva: tax, clientPays, processingCost,
    });
  }

  return {
    jobPrice: round2(price),
    commission: round2(comm),
    vat: round2(tax),
    processingCharge: proc.cargo,
    processingVat: proc.iva,
    totalVat: round2(tax + proc.iva),
    clientPays,
    processingCost,
    processingCostVat,
    workerReceives: round2(price),
    platformKeeps,
    rate: proc.rate,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface DesgloseCancelacion {
  /** Lo que el cliente pagó en total, procesamiento incluido. */
  pagado: number;
  /** Precio del trabajo, sin comisión, IVA ni procesamiento. */
  precioTrabajo: number;
  comision: number;
  iva: number;
  /** Lo que pagó de procesamiento (con su IVA). Ya se fue a la pasarela y no vuelve. */
  procesamiento: number;
  /** Lo que se le devuelve al cliente si retira a efectivo. */
  devolver: number;
  /** Lo que no vuelve al cliente en ese caso: procesamiento + parte de la comisión. */
  retiene: number;
}

/**
 * Qué recibiría en efectivo el cliente si cancela ANTES de que un admin apruebe
 * la publicación y retira el saldo (T&C 9.1): todo menos el procesamiento (que
 * ya se fue) y menos la parte de la comisión que fija la política. Si en
 * cambio deja el saldo en la app, recupera precio + comisión + IVA
 * (liq.aCliente) y no paga nada más.
 *
 * Es una vista del caso particular de liquidarCancelacion (la función general,
 * que decide la regla). No calcula nada por su cuenta: si las dos dijeran
 * cosas distintas volveríamos al problema que esto vino a resolver.
 */
export function desgloseCancelacionSinContratar(
  pagado: number,
  comision: number,
  iva: number,
  procesamiento = 0,
): DesgloseCancelacion {
  const total = round2(importeValido(pagado, 'total pagado'));
  const comm = round2(importeValido(comision, 'comisión'));
  const tax = round2(importeValido(iva, 'IVA'));
  const proc = round2(importeValido(procesamiento, 'procesamiento'));

  // Las partes no pueden sumar mas que el total: seria devolver mas de lo que
  // entro. Si eso pasa, el pago esta mal registrado y hay que mirarlo, no
  // seguir con una cuenta inventada.
  if (comm + tax + proc > total + 0.01) {
    throw new ErrorDeCalculo('Las partes del pago suman más que el total pagado', {
      pagado: total, comision: comm, iva: tax, procesamiento: proc,
    });
  }

  const precioTrabajo = round2(Math.max(0, total - comm - tax - proc));

  const liq = liquidarCancelacion({
    precio: precioTrabajo, comision: comm, iva: tax, procesamiento: proc,
    aprobada: false, hayTrabajador: false, tardia: false,
  });

  const retiene = round2(proc + liq.alRetirar.comision);
  return {
    pagado: total,
    precioTrabajo,
    comision: comm,
    iva: tax,
    procesamiento: proc,
    devolver: round2(Math.max(0, liq.aCliente - liq.alRetirar.comision)),
    retiene,
  };
}

export interface LiquidacionCancelacion {
  /**
   * Lo que el cliente pago de procesamiento (con IVA) y no vuelve: ya se fue a
   * la pasarela cuando pago. Se informa para el mensaje y el expediente.
   */
  procesamientoNoVuelve: number;
  /**
   * Comision + IVA que retiene la plataforma EN EL ACTO. Solo cuando ya habia
   * un trabajador seleccionado: la intermediacion ocurrio. Sin trabajador la
   * comision vuelve como saldo, y se retiene una parte solo si el cliente
   * retira ese saldo (ver alRetirar).
   */
  retieneApp: number;
  /**
   * Lo que se acredita al cliente como saldo a favor, bruto. Usarlo dentro de
   * la app no cuesta nada.
   */
  aCliente: number;
  /** Lo que se le paga al trabajador por el dia que reservo. Entero: la pasarela ya la pago el cliente. */
  aTrabajador: number;
  /**
   * Lo que se retiene si el cliente RETIRA ese saldo a efectivo: la parte de
   * la comision que fija la politica (solo sin trabajador). Va en la metadata
   * del credito para que el retiro lo lea. Transferir a un CBU no tiene costo
   * de pasarela.
   */
  alRetirar: { comision: number };
  /** Por que salio asi, para mostrarlo y para el expediente. */
  regla: 'antes_de_aprobar' | 'sin_trabajador' | 'con_tiempo' | 'tardia_con_trabajador';
}

/**
 * Como se reparte la plata cuando se cancela. Una sola funcion para los dos
 * caminos que la mueven (el cliente cancela la publicacion; un admin aprueba la
 * cancelacion de un contrato), asi no vuelven a decir cosas distintas.
 *
 * El procesamiento no entra en el reparto: el cliente lo pago al pagar y ya se
 * fue a la pasarela. Lo que se reparte es precio + comision + IVA.
 *
 *   1. Sin trabajador seleccionado -- antes o despues de la aprobacion --
 *      el cliente recupera precio + comision + IVA como saldo a favor. Puede
 *      republicar sin pagar de nuevo. Si en cambio retira ese saldo, se le
 *      retiene la mitad de la comision (CANCELACION_EN_REVISION_PARTE_COMISION,
 *      con su IVA) por la revision que ya se hizo. T&C 9.1/9.2.
 *
 *   2. Con trabajador seleccionado, la comision se retiene en el acto: la
 *      intermediacion ocurrio (T&C 7.5). El precio vuelve como saldo, y
 *      retirarlo no cuesta nada.
 *
 *   3. Con trabajador y menos de CANCELACION_CLIENTE_HORAS_ANTES, la mitad del
 *      precio es del trabajador (reservo el dia y lo perdio, T&C 9.3), entera.
 *      La otra mitad vuelve al cliente como saldo.
 */
export function liquidarCancelacion(args: {
  precio: number;
  comision: number;
  iva: number;
  /** Lo que el cliente pago de procesamiento, con IVA. Solo para informarlo. */
  procesamiento?: number;
  /** Si un admin ya aprobo la publicacion. */
  aprobada: boolean;
  /** Si habia un trabajador seleccionado. */
  hayTrabajador: boolean;
  /** Si faltan menos de las horas de la politica, o el trabajo ya empezo. */
  tardia: boolean;
  parteTrabajador?: number;
  /** Solo para tests; en produccion sale de POLITICAS. */
  parteComisionEnRevision?: number;
}): LiquidacionCancelacion {
  const precio = round2(importeValido(args.precio, 'precio'));
  const comision = round2(importeValido(args.comision, 'comisión'));
  const iva = round2(importeValido(args.iva, 'IVA'));
  const procesamientoNoVuelve = round2(importeValido(args.procesamiento, 'procesamiento'));
  const parte = proporcionValida(args.parteTrabajador ?? 0.5, 'parte del trabajador');
  const parteRevision = proporcionValida(
    args.parteComisionEnRevision ?? POLITICAS.CANCELACION_EN_REVISION_PARTE_COMISION,
    'parte de la comisión por la revisión',
  );

  if (!args.hayTrabajador) {
    // Nadie trabajo: vuelve precio + comision + IVA como saldo. Retirarlo
    // cuesta media comision (la revision se hizo igual).
    return {
      procesamientoNoVuelve,
      retieneApp: 0,
      aCliente: round2(precio + comision + iva),
      aTrabajador: 0,
      alRetirar: { comision: round2((comision + iva) * parteRevision) },
      regla: args.aprobada ? 'sin_trabajador' : 'antes_de_aprobar',
    };
  }

  const retieneApp = round2(comision + iva);

  if (!args.tardia) {
    return {
      procesamientoNoVuelve,
      retieneApp,
      aCliente: precio,
      aTrabajador: 0,
      alRetirar: { comision: 0 },
      regla: 'con_tiempo',
    };
  }

  const aTrabajador = round2(precio * parte);
  return {
    procesamientoNoVuelve,
    retieneApp,
    aCliente: round2(precio - aTrabajador),
    aTrabajador,
    alRetirar: { comision: 0 },
    regla: 'tardia_con_trabajador',
  };
}

/** Texto unico para las dos apps, asi no se explica distinto en cada pantalla. */
export const PROCESSING_COST_LABEL = 'Costo de procesamiento del pago';

export const PROCESSING_COST_HELP =
  'Es lo que cuesta procesar el pago con Mercado Pago. Es una tasa única, igual con cualquier medio de pago, y no se devuelve si cancelás: la pasarela ya lo cobró. El trabajador recibe el precio completo.';
