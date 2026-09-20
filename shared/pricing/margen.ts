import { IVA, getProcessingFeeRate } from './processingCost.js';

/**
 * Que le queda a DOAPP de una operacion, despues de la pasarela y de los
 * impuestos. Es la cuenta que responde "¿la comision cubre IVA, IIBB y
 * retenciones?" con numeros, para cada operacion y para el piso.
 *
 * Los cuatro cargos que hay, y de que lado caen:
 *
 *   Tarifa de MP (sin IVA)       la absorbe quien recibe la plata (trabajador,
 *                                o cliente si retira). Para DOAPP es cero.
 *   IVA de la tarifa de MP       MP se lo factura a DOAPP; DOAPP lo toma como
 *                                credito contra el IVA de su comision. Cero.
 *   IVA de la comision           DOAPP lo cobra al cliente y lo debe a ARCA.
 *                                Entra y sale: no es ingreso ni costo.
 *   Ingresos Brutos              DOS cosas distintas:
 *     - el impuesto PROPIO: alicuota sobre la comision (el ingreso real).
 *       Es un costo de DOAPP.
 *     - la RETENCION: MP retiene un % sobre el TOTAL acreditado (precio +
 *       comision + IVA), en cada pago. No es un impuesto sobre ese total, es
 *       un pago a cuenta del propio. Lo que excede al propio queda como
 *       credito fiscal. Si ese credito se puede usar, cuesta cero; si no,
 *       es plata parada, y con mucho dinero ajeno pasando por la cuenta se
 *       acumula mas rapido de lo que se consume.
 *
 * Las alicuotas son de cada empresa (padron, jurisdiccion) y cambian: se leen
 * del entorno. Los defaults son el PEOR caso (no inscripto: 3% de retencion;
 * alicuota propia alta), a proposito: si la cuenta cierra con el peor caso,
 * cierra siempre.
 */

export interface CostosDeOperacion {
  /** Lo que cobro el cliente y entro a MP. */
  totalCobrado: number;
  /** Ingreso de DOAPP: la comision, sin IVA. */
  ingreso: number;
  /** IVA que DOAPP cobro al cliente sobre la comision. Lo debe. */
  ivaDebito: number;
  /** IVA que MP le facturo a DOAPP sobre su tarifa. Lo descuenta. */
  ivaCredito: number;
  /** Lo que DOAPP gira de IVA: debito - credito (nunca negativo aca; el resto queda a favor). */
  ivaAPagar: number;
  /** Tarifa de MP sin IVA. La absorbe otro, se muestra para completar la cuenta. */
  pasarela: number;
  /** IIBB propio: alicuota x ingreso. Costo real. */
  iibbPropio: number;
  /** Lo que MP retiene a cuenta sobre el total acreditado. */
  iibbRetenido: number;
  /** Retencion que excede al impuesto propio: queda como credito fiscal. */
  iibbCreditoExcedente: number;
  /** Ingreso menos IIBB propio. Es el margen si el credito de IIBB se usa. */
  margenSiCreditoSeUsa: number;
  /** Ingreso menos TODA la retencion. Es el margen si el credito nunca se consume. */
  margenSiCreditoSePierde: number;
}

function leerAlicuota(nombre: string, porDefecto: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[nombre] : undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 0.2 ? n : porDefecto;
}

/** Retencion de IIBB que aplica MP sobre cada acreditacion. Peor caso: no inscripto, 3%. */
export function alicuotaRetencionIIBB(): number {
  return leerAlicuota('IIBB_RETENCION_ALICUOTA', 0.03);
}

/** IIBB propio sobre el ingreso de DOAPP. Servicios en CABA/PBA rondan 3-5%. */
export function alicuotaIIBBPropia(): number {
  return leerAlicuota('IIBB_ALICUOTA_PROPIA', 0.05);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function costosDeOperacion(args: {
  precio: number;
  comision: number;
  iva?: number;
  ratePasarela?: number;
  retencionIIBB?: number;
  iibbPropio?: number;
}): CostosDeOperacion {
  const precio = Math.max(0, Number(args.precio) || 0);
  const comision = Math.max(0, Number(args.comision) || 0);
  const iva = args.iva != null ? Math.max(0, Number(args.iva) || 0) : r2(comision * IVA);
  const rate = args.ratePasarela ?? getProcessingFeeRate();
  const retencion = args.retencionIIBB ?? alicuotaRetencionIIBB();
  const propio = args.iibbPropio ?? alicuotaIIBBPropia();

  const totalCobrado = r2(precio + comision + iva);
  const pasarela = r2(totalCobrado * rate);
  const ivaCredito = r2(pasarela * IVA);
  const ivaDebito = iva;
  const ivaAPagar = r2(Math.max(0, ivaDebito - ivaCredito));
  const iibbPropio = r2(comision * propio);
  const iibbRetenido = r2(totalCobrado * retencion);
  const iibbCreditoExcedente = r2(Math.max(0, iibbRetenido - iibbPropio));

  return {
    totalCobrado,
    ingreso: comision,
    ivaDebito,
    ivaCredito,
    ivaAPagar,
    pasarela,
    iibbPropio,
    iibbRetenido,
    iibbCreditoExcedente,
    margenSiCreditoSeUsa: r2(comision - iibbPropio),
    margenSiCreditoSePierde: r2(comision - Math.max(iibbPropio, iibbRetenido)),
  };
}
