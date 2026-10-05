/**
 * Conversión entre pesos, dólares y euros para el plan de negocio.
 *
 * Las tasas se guardan contra el euro (`rateArs` = pesos por euro, `rateUsd` =
 * dólares por euro) y de ahí se pasa a cualquier moneda. Antes esto vivía sólo
 * dentro de la pantalla del plan; sale a `shared/` para poder probarlo y porque
 * ahora lo usan dos lugares.
 *
 * ── Por qué existe `convertirImportesUe` ────────────────────────────────────
 *
 * La sección "Unit economics" del plan guarda sus importes —ticket, soporte y
 * costos fijos— en la moneda que diga su selector. Cambiar el selector sólo
 * cambiaba la etiqueta: `ticket = 21` pasaba de "US$21" a "$21" sin tocar el
 * número, o sea que la pantalla afirmaba un ticket de veintiún pesos, y los
 * equivalentes en euros se desplomaban a cero. El dato no se convertía.
 *
 * Sólo se convierten los importes. `comision`, `disputas` y `fraude` son
 * porcentajes y `contratos` y `mauActual` son cantidades: no cambian con la
 * moneda, y convertirlos los rompería.
 */

export type Moneda = 'ARS' | 'USD' | 'EUR';

export interface Tasas {
  /** Pesos por euro. */
  rateArs: number;
  /** Dólares por euro. */
  rateUsd: number;
}

/** Un importe en `desde`, expresado en euros. */
export function aEuros(monto: number, desde: Moneda, tasas: Tasas): number {
  const valor = Number(monto) || 0;
  if (desde === 'EUR') return valor;
  if (desde === 'ARS') return valor / (tasas.rateArs || 1);
  return valor / (tasas.rateUsd || 1);
}

/** Un importe en euros, expresado en `hasta`. */
export function desdeEuros(euros: number, hasta: Moneda, tasas: Tasas): number {
  if (hasta === 'EUR') return euros;
  if (hasta === 'ARS') return euros * (tasas.rateArs || 1);
  return euros * (tasas.rateUsd || 1);
}

/** Un importe de una moneda a otra, pasando por el euro. */
export function convertirMoneda(monto: number, desde: Moneda, hasta: Moneda, tasas: Tasas): number {
  if (desde === hasta) return Number(monto) || 0;
  return desdeEuros(aEuros(monto, desde, tasas), hasta, tasas);
}

/** Los campos de la unidad económica que son importes. El resto no se convierte. */
export const CAMPOS_IMPORTE_UE = ['ticket', 'soporte', 'fijos'] as const;

export interface ImportesUe {
  ticket: number;
  soporte: number;
  fijos: number;
}

/**
 * Cuatro decimales fijos. Se probaron antes las dos alternativas obvias y las dos
 * fallan por motivos distintos:
 *
 *  - Centavos: `soporte = 1` USD son 0,9259 euros y a centavos queda 0,93, un
 *    0,4% de error. Parece poco, pero el margen es una DIFERENCIA pequeña entre
 *    dos números grandes (con los valores por defecto, el 7,5% del ingreso), así
 *    que el error se amplifica unas quince veces: el punto de equilibrio en euros
 *    salía 3,8% distinto del de dólares.
 *
 *  - Cifras significativas: exacto, pero no reversible. Dólares -> pesos -> euros
 *    -> dólares devolvía el soporte como 0,9999996 en vez de 1, y quien mira el
 *    campo concluye que cambió solo.
 *
 * Con cuatro decimales el error queda en el orden de una diezmilésima del importe
 * (suficiente para que el equilibrio coincida entre monedas hasta ~0,05%) y los
 * viajes de ida y vuelta devuelven el número original.
 */
const redondear = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * La unidad económica pasada a otra moneda: convierte los importes y deja
 * intactos los porcentajes y las cantidades.
 *
 * Se redondea para que los campos no muestren `30333.333333333332` (ver
 * `redondear`). Ir y volver de una moneda a otra devuelve el número original.
 */
export function convertirImportesUe<T extends ImportesUe>(
  ue: T,
  desde: Moneda,
  hasta: Moneda,
  tasas: Tasas,
): T {
  if (desde === hasta) return ue;
  const convertido: T = { ...ue };
  for (const campo of CAMPOS_IMPORTE_UE) {
    convertido[campo] = redondear(convertirMoneda(ue[campo], desde, hasta, tasas)) as T[typeof campo];
  }
  return convertido;
}
