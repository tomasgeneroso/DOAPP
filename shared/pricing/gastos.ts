import { convertirMoneda, type Moneda, type Tasas } from './conversionMoneda.js';

/**
 * Qué es cada gasto del presupuesto, en un solo lugar.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El plan tiene un presupuesto mensual (gastos de la beta, gastos de la etapa
 * real) y tres consumidores que necesitan saber qué es cada línea: la economía
 * unitaria (cuánto se gasta en conseguir usuarios), la proyección (qué es costo
 * fijo y qué es publicidad) y el cálculo del punto de equilibrio. Cada uno
 * decidía por su cuenta, y el servidor lo hacía con una expresión regular:
 *
 *     /ads?|adquisi|marketing|pauta|publicidad|ventas/i
 *
 * que coincide con cualquier texto que CONTENGA "ad". "Retainer **ad**ogado
 * laboral" y "Honorarios gestor/cont**ad**or" contaban como publicidad. Con el
 * presupuesto por defecto el gasto de adquisición salía US$4.800 en vez de
 * US$3.000: un CAC inflado un 60%, y de ahí un LTV/CAC y un payback peores de lo
 * que son. Nadie lo vio porque el número parecía razonable.
 *
 * Ahora cada línea lleva su TIPO escrito, que es lo que manda, y las líneas que
 * no lo tienen (planes guardados antes de que existiera) se clasifican con una
 * expresión que exige que la palabra EMPIECE ahí (`\b`).
 *
 * ── Los tres tipos y qué hace el modelo con cada uno ────────────────────────
 *
 *  - `fijo`: se paga igual haya o no usuarios (abogado, servidor, sueldos,
 *    contingencia). Entra a los costos fijos del modelo.
 *  - `adquisicion`: plata gastada en conseguir usuarios (publicidad). NO es un
 *    costo fijo: es lo que genera las altas, y se convierte en altas dividiéndola
 *    por el costo de adquirir un usuario (CAC). Contarla también como fijo la
 *    cuenta dos veces.
 *  - `soporte`: atención y disputas. En la BETA, con pocos usuarios, se hace a
 *    mano y es un monto fijo mensual. En la etapa REAL el modelo lo calcula por
 *    usuario (soporte por usuario, disputas y fraude), así que esta línea no se
 *    suma a los fijos: sumarla además de eso la cuenta dos veces.
 */

export type TipoDeGasto = 'fijo' | 'adquisicion' | 'soporte';

export const TIPOS_DE_GASTO: readonly TipoDeGasto[] = ['fijo', 'adquisicion', 'soporte'];

export const ROTULO_DE_TIPO: Record<TipoDeGasto, string> = {
  fijo: 'Fijo',
  adquisicion: 'Publicidad (conseguir usuarios)',
  soporte: 'Soporte y disputas',
};

/**
 * Para las líneas SIN tipo escrito. `\b` exige que la palabra empiece ahí: sin
 * eso, "ad" dentro de "abogado" o de "contador" coincidía.
 */
const ES_ADQUISICION = /\b(ads|adquisici|marketing|pauta|publicidad|ventas|leads)/i;
const ES_SOPORTE = /\b(soporte|disput|atenci[oó]n al cliente|mesa de ayuda)/i;

export interface FilaDeGasto {
  c: string;
  m: number;
  n?: string;
  tipo?: TipoDeGasto;
}

const esTipoValido = (t: unknown): t is TipoDeGasto =>
  typeof t === 'string' && (TIPOS_DE_GASTO as readonly string[]).includes(t);

/** El tipo de una línea: el escrito si es válido, y si no el que se deduce del nombre. */
export function tipoDeGasto(fila: { c?: string; tipo?: unknown }): TipoDeGasto {
  if (esTipoValido(fila.tipo)) return fila.tipo;
  const nombre = String(fila.c ?? '');
  if (ES_ADQUISICION.test(nombre)) return 'adquisicion';
  if (ES_SOPORTE.test(nombre)) return 'soporte';
  return 'fijo';
}

export interface TotalesDeGastos {
  fijo: number;
  adquisicion: number;
  soporte: number;
  /** Todo lo que se gasta en el mes: es lo que consume la caja. */
  total: number;
}

const monto = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Lo que suma cada tipo de gasto, en la moneda de la tabla. */
export function totalesPorTipo(filas: Array<{ c?: string; m?: number; tipo?: unknown }>): TotalesDeGastos {
  const t: TotalesDeGastos = { fijo: 0, adquisicion: 0, soporte: 0, total: 0 };
  for (const f of Array.isArray(filas) ? filas : []) {
    const m = monto(f?.m);
    t[tipoDeGasto(f ?? {})] += m;
    t.total += m;
  }
  return t;
}

/**
 * El presupuesto mensual con que arranca un plan nuevo, en dólares.
 *
 * Vive acá y no en el plan por defecto del servidor porque lo necesitan dos
 * lugares que tienen que coincidir: el plan (que lo carga como gastos de la beta)
 * y la guía (que arma su ejemplo con los costos fijos que salen de él). Con la
 * lista en dos sitios, el ejemplo de la guía dejó de coincidir con la pantalla.
 */
export const PRESUPUESTO_DE_ARRANQUE_USD: Array<Required<Pick<FilaDeGasto, 'c' | 'm' | 'n'>>> = [
  { c: 'Meta Ads / adquisición', m: 3000, n: 'Fase 1: 500 MAU meta' },
  { c: 'Retainer abogado laboral', m: 1800, n: 'gig economy' },
  { c: 'Infraestructura tech (hosting, dominio, APIs)', m: 900, n: '' },
  { c: 'Soporte y resolución de disputas (manual)', m: 1200, n: 'antes de automatizar' },
  { c: 'Sueldos / founders', m: 0, n: '' },
  { c: 'Contingencia (10%)', m: 700, n: '' },
];

/** Los costos fijos de ese presupuesto, en dólares: lo que no es publicidad ni soporte. */
export const FIJOS_DE_ARRANQUE_USD = totalesPorTipo(PRESUPUESTO_DE_ARRANQUE_USD).fijo;

/** Los totales de la tabla pasados a otra moneda. */
export function totalesEnMoneda(
  filas: Array<{ c?: string; m?: number; tipo?: unknown }>,
  monedaDeLaTabla: Moneda,
  haciaMoneda: Moneda,
  tasas: Tasas,
): TotalesDeGastos {
  const t = totalesPorTipo(filas);
  const pasar = (n: number) => convertirMoneda(n, monedaDeLaTabla, haciaMoneda, tasas);
  return {
    fijo: pasar(t.fijo),
    adquisicion: pasar(t.adquisicion),
    soporte: pasar(t.soporte),
    total: pasar(t.total),
  };
}
