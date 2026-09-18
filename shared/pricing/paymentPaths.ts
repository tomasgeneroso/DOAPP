import { splitFees, getProcessingFeeRate } from './processingCost.js';

/**
 * Los caminos por los que puede entrar un pago, y que cambia en cada uno.
 *
 * El cliente paga siempre lo mismo (precio + comision + IVA). Lo que cambia
 * con el medio es lo que cobra la pasarela -- y eso lo absorbe el trabajador --
 * y cuantos dias tarda Mercado Pago en liberar la plata, que corre el dia en
 * que el trabajador puede cobrar. Con tarjeta de credito a 10 dias la tarifa
 * es la mas alta y la liberacion la mas lenta; con dinero en cuenta de MP la
 * tarifa suele ser menor y la liberacion inmediata.
 *
 * Los numeros de debito y dinero en cuenta NO estan escritos aca: los cobra
 * MP y cambian; el unico lugar que los sabe es el panel (Tu negocio → Costos).
 * Se leen del entorno (PAYMENT_FEE_RATE_DEBIT, PAYMENT_FEE_RATE_ACCOUNT_MONEY,
 * con IVA incluido) y si no estan, ese camino no se muestra. Mostrar un numero
 * inventado seria peor que no mostrarlo: el descuento real sale del pago
 * aprobado (fee_details), y una promesa distinta es un reclamo.
 */

export type CaminoId = 'tarjeta_credito' | 'tarjeta_debito' | 'dinero_en_cuenta';

export interface ConfigCamino {
  /** Tarifa con IVA, fraccion del total cobrado. null = no configurado. */
  rate: number | null;
  /** Dias hasta que MP libera la plata al vendedor. */
  liberacionDias: number;
}

export interface CaminoDePago {
  id: CaminoId;
  titulo: string;
  descripcion: string;
  rate: number;
  /** Tarifa en porcentaje con dos decimales, para mostrar. */
  ratePct: number;
  clientePaga: number;
  pasarela: number;
  trabajadorRecibe: number;
  liberacionDias: number;
}

export const TITULOS: Record<CaminoId, { titulo: string; descripcion: string }> = {
  tarjeta_credito: {
    titulo: 'Tarjeta de crédito',
    descripcion: 'La tarifa más alta y la liberación más lenta: Mercado Pago retiene la plata unos días como garantía contra contracargos.',
  },
  tarjeta_debito: {
    titulo: 'Tarjeta de débito',
    descripcion: 'Tarifa menor y liberación más rápida que con crédito.',
  },
  dinero_en_cuenta: {
    titulo: 'Dinero en cuenta de Mercado Pago',
    descripcion: 'Pagás con el saldo de tu cuenta de MP. Suele ser la tarifa más baja y se libera al instante: el trabajador cobra antes.',
  },
};

function leerEnv(nombre: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[nombre] : undefined;
}

function tasa(nombre: string): number | null {
  const n = Number(leerEnv(nombre));
  return Number.isFinite(n) && n >= 0 && n < 0.5 ? n : null;
}

function dias(nombre: string, porDefecto: number): number {
  const n = Number(leerEnv(nombre));
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

/** La configuracion vigente, leida del entorno del servidor. */
export function configDeCaminos(): Record<CaminoId, ConfigCamino> {
  return {
    tarjeta_credito: { rate: getProcessingFeeRate(), liberacionDias: dias('PAYMENT_RELEASE_DAYS', 0) },
    tarjeta_debito: { rate: tasa('PAYMENT_FEE_RATE_DEBIT'), liberacionDias: dias('PAYMENT_RELEASE_DAYS_DEBIT', 0) },
    dinero_en_cuenta: { rate: tasa('PAYMENT_FEE_RATE_ACCOUNT_MONEY'), liberacionDias: dias('PAYMENT_RELEASE_DAYS_ACCOUNT_MONEY', 0) },
  };
}

/**
 * Los caminos configurados, con la cuenta hecha para este precio. Ordenados
 * del que mas le conviene al trabajador al que menos.
 */
export function caminosDePago(
  precio: number,
  comision: number,
  iva: number,
  config: Record<CaminoId, ConfigCamino> = configDeCaminos(),
): CaminoDePago[] {
  const ids: CaminoId[] = ['tarjeta_credito', 'tarjeta_debito', 'dinero_en_cuenta'];
  const out: CaminoDePago[] = [];
  for (const id of ids) {
    const c = config[id];
    if (c.rate === null) continue;
    const s = splitFees(precio, comision, iva, c.rate);
    out.push({
      id,
      ...TITULOS[id],
      rate: c.rate,
      ratePct: Math.round(c.rate * 10000) / 100,
      clientePaga: s.clientPays,
      pasarela: s.processingCost,
      trabajadorRecibe: s.workerReceives,
      liberacionDias: c.liberacionDias,
    });
  }
  return out.sort((a, b) => b.trabajadorRecibe - a.trabajadorRecibe || a.liberacionDias - b.liberacionDias);
}

/** Lo minimo y lo maximo que puede recibir el trabajador segun como pague el cliente. */
export function rangoDelTrabajador(caminos: CaminoDePago[]): { min: number; max: number; varia: boolean } {
  if (caminos.length === 0) return { min: 0, max: 0, varia: false };
  const montos = caminos.map((c) => c.trabajadorRecibe);
  const min = Math.min(...montos);
  const max = Math.max(...montos);
  return { min, max, varia: max - min >= 1 };
}
