/**
 * Conversión entre pesos, dólares y euros para el plan de negocio.
 *
 * Las tasas se guardan contra el euro (`rateArs` = pesos por euro, `rateUsd` =
 * dólares por euro) y de ahí se pasa a cualquier moneda.
 *
 * ── Qué problema resuelve el "origen" ───────────────────────────────────────
 *
 * La sección "Unit economics" del plan guarda sus importes —ticket, soporte y
 * costos fijos— en la moneda que diga su selector. Al cambiar el selector sólo
 * cambiaba la etiqueta: `ticket = 21` pasaba de "US$21" a "$21", o sea que la
 * pantalla afirmaba un ticket de veintiún pesos.
 *
 * La primera solución fue convertir el valor que hubiera en pantalla. Funcionaba
 * para un cambio, pero cada conversión se hace sobre un valor ya redondeado, y los
 * errores se acumulan: dólares → pesos → euros → dólares devolvía el soporte como
 * 0,9999996 en vez de 1, y ningún redondeo fijo lo evita del todo, porque al
 * volver de euros a dólares el error se multiplica por la tasa.
 *
 * Lo que se pide —que se pueda ir de cualquier moneda a cualquier otra, en
 * cualquier orden, y que siempre dé el equivalente— no se resuelve ajustando el
 * redondeo sino cambiando qué se guarda: **el importe tal como se escribió y en
 * qué moneda** (el "origen"). Lo que se ve en cualquier otra moneda es una
 * derivación del origen, siempre calculada desde ahí y nunca encima de otra
 * conversión. Así el resultado no depende del camino:
 *
 *     escribo US$21  →  pesos  →  euros  →  pesos  →  dólares
 *
 * y en cada paso se ve la conversión directa de US$21, y al volver a dólares se
 * ve 21 exacto, porque el origen es 21 dólares.
 *
 * Los porcentajes (`comision`, `disputas`, `fraude`) y las cantidades
 * (`contratos`, `mauActual`) no cambian con la moneda y no se tocan.
 */

export type Moneda = 'ARS' | 'USD' | 'EUR';

export interface Tasas {
  /** Pesos por euro. */
  rateArs: number;
  /** Dólares por euro. */
  rateUsd: number;
}

const MONEDAS: readonly Moneda[] = ['ARS', 'USD', 'EUR'];

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

/* ------------------------------------------------------------------ *
 * Los importes de la unidad económica y su origen
 * ------------------------------------------------------------------ */

/** Los campos de la unidad económica que son importes. El resto no se convierte. */
export const CAMPOS_IMPORTE_UE = ['ticket', 'soporte', 'fijos'] as const;
export type CampoImporteUe = (typeof CAMPOS_IMPORTE_UE)[number];

export interface ImportesUe {
  ticket: number;
  soporte: number;
  fijos: number;
}

/** Un importe tal como se escribió: cuánto, y en qué moneda. */
export interface Origen {
  moneda: Moneda;
  monto: number;
}

export type OrigenImportes = Partial<Record<CampoImporteUe, Origen>>;

/** La parte del plan que toca esta lógica. El plan real tiene muchos campos más. */
export interface PlanConImportesUe extends Tasas {
  ue: ImportesUe;
  ueCurrency: Moneda;
  /** Ausente en los planes guardados antes de que existiera. */
  ueOrigen?: OrigenImportes;
}

/**
 * Nueve cifras significativas para lo que se DERIVA.
 *
 * Lo derivado se calcula siempre desde el origen y nunca se vuelve a convertir,
 * así que el redondeo no se acumula y se puede ser generoso. Se redondea por
 * cifras significativas y no por decimales porque los importes pueden ser de
 * magnitudes muy distintas: un peso son 0,000641 euros, y a seis decimales eso
 * queda con un 4% de error relativo. Con nueve cifras el error es del orden de
 * una milmillonésima a cualquier escala. Sólo evita que el campo muestre
 * `30333.333333333332`.
 *
 * (Antes, con la conversión encima del valor en pantalla, esto no era posible:
 * las cifras significativas no son reversibles y el soporte volvía como
 * 0,9999996. Con el origen la reversibilidad no depende del redondeo.)
 */
const redondear = (n: number) => Number(n.toPrecision(9));

const esOrigenValido = (o: unknown): o is Origen =>
  !!o &&
  typeof o === 'object' &&
  MONEDAS.includes((o as Origen).moneda) &&
  Number.isFinite((o as Origen).monto) &&
  (o as Origen).monto >= 0;

/** Un origen en otra moneda. En la misma moneda es exacto, sin pasar por el euro. */
function derivar(origen: Origen, hasta: Moneda, tasas: Tasas): number {
  if (origen.moneda === hasta) return origen.monto;
  return redondear(convertirMoneda(origen.monto, origen.moneda, hasta, tasas));
}

/**
 * Completa los orígenes que falten con lo que hay en pantalla.
 *
 * Un plan guardado antes de que existiera el origen no lo tiene. Lo que se ve en
 * pantalla está, por definición, en la moneda actual de la sección: se toma eso
 * como lo escrito.
 */
function adoptarOrigenes(plan: PlanConImportesUe): void {
  const origen: OrigenImportes = { ...(plan.ueOrigen || {}) };
  for (const campo of CAMPOS_IMPORTE_UE) {
    if (!esOrigenValido(origen[campo])) {
      origen[campo] = { moneda: plan.ueCurrency, monto: Math.max(0, Number(plan.ue[campo]) || 0) };
    }
  }
  plan.ueOrigen = origen;
}

/**
 * Deja los importes que se ven en la moneda actual de la sección, derivados de
 * su origen. Idempotente: se puede llamar después de cualquier edición.
 *
 * Es lo que hace que un cambio de tasas se refleje sin tocar nada más: el
 * importe escrito en dólares sigue valiendo lo mismo en dólares, y su
 * equivalente en pesos se recalcula con la tasa nueva.
 */
export function sincronizarImportesUe(plan: PlanConImportesUe): void {
  const origen = plan.ueOrigen;
  if (!origen) return;
  for (const campo of CAMPOS_IMPORTE_UE) {
    const o = origen[campo];
    if (esOrigenValido(o)) plan.ue[campo] = derivar(o, plan.ueCurrency, plan);
  }
}

/**
 * Cambia la moneda de la sección. Muta `plan`, pensado para el borrador que
 * entrega la pantalla antes de guardar.
 *
 * Cualquier moneda a cualquier otra, en cualquier orden: cada vez se deriva del
 * origen, así que no hay acumulación de error ni dependencia del camino.
 */
export function cambiarMonedaUe(plan: PlanConImportesUe, nueva: Moneda): void {
  if (plan.ueCurrency === nueva) return;
  adoptarOrigenes(plan);
  plan.ueCurrency = nueva;
  sincronizarImportesUe(plan);
}

/**
 * Registra un importe escrito a mano (o puesto por un botón). Es lo que lo
 * convierte en el nuevo origen de ese campo.
 *
 * `moneda` es la moneda del importe y, si no se indica, la actual de la sección:
 * lo que se tipea en un campo está en la moneda que se ve. Pero un botón conoce
 * la moneda de su dato —los números reales de la plataforma vienen en pesos, el
 * presupuesto de la Fase 1 en la moneda del presupuesto— y debe registrarla como
 * origen en vez de pasar por la de la sección, que sólo sumaría una conversión
 * de más.
 */
export function editarImporteUe(
  plan: PlanConImportesUe,
  campo: CampoImporteUe,
  monto: number,
  moneda: Moneda = plan.ueCurrency,
): void {
  adoptarOrigenes(plan);
  const origen: Origen = { moneda, monto: Math.max(0, Number(monto) || 0) };
  plan.ueOrigen![campo] = origen;
  plan.ue[campo] = derivar(origen, plan.ueCurrency, plan);
}
