import { COMMISSION_RATES } from '../constants/membershipPricing.js';
import { MARGINAL_COST_PER_CONTRACT_ARS } from './minimums.js';

/**
 * La cuenta de la unidad económica, una sola vez.
 *
 * Por qué existe este archivo: la misma cuenta estaba escrita dos veces —en la
 * pantalla de la proyección y en el servicio de métricas— y las dos versiones
 * no coincidían. La pantalla trataba `disputas` y `fraude` como porcentajes del
 * volumen; el servicio los sumaba como si fueran dólares. Con los valores por
 * defecto eso daba $17.628 de costo por contrato en un lado y otra cosa en el
 * otro, y las dos se mostraban como si fueran el mismo número.
 *
 * Es el mismo error que la tabla de comisiones: una cuenta de plata escrita
 * dos veces termina diciendo dos cosas, y nadie se entera hasta que alguien
 * compara.
 *
 * ── Qué modela ──────────────────────────────────────────────────────────────
 *
 * Todo es POR USUARIO ACTIVO POR MES, no por contrato. Un usuario hace
 * `contratos` contratos en el mes, cada uno de `ticket` pesos:
 *
 *   volumen  = ticket × contratos          (lo que mueve ese usuario en el mes)
 *   ingreso  = volumen × comisión          (lo que de eso se queda DOAPP)
 *   costo    = soporte + volumen × (disputas% + fraude%)
 *   margen   = ingreso − costo             (la contribución mensual)
 *
 * `soporte` es un importe fijo por usuario y por mes; `disputas` y `fraude`
 * son porcentajes del volumen, porque escalan con la plata que pasa, no con la
 * cantidad de gente.
 */

export interface SupuestosUnidad {
  /** Precio promedio de un trabajo. */
  ticket: number;
  /** Contratos que hace un usuario activo en un mes. */
  contratos: number;
  /** Porcentaje que se queda DOAPP. Si no viene, el del código. */
  comisionPct?: number;
  /** Importe fijo de soporte por usuario y por mes. */
  soporte: number;
  /** Porcentaje del volumen que se pierde en disputas. */
  disputasPct: number;
  /** Porcentaje del volumen que se pierde en fraude y contracargos. */
  fraudePct: number;
}

export interface UnidadEconomica {
  volumen: number;
  ingreso: number;
  costoSoporte: number;
  costoDisputas: number;
  costoFraude: number;
  costoTotal: number;
  margen: number;
  /** Lo mismo pero por contrato, que es como se suele razonar. */
  porContrato: {
    ingreso: number;
    costo: number;
    margen: number;
  };
  /**
   * Los mismos importes SIN redondear: para dividir, no para mostrar.
   *
   * Los campos de arriba se redondean a centavos porque son lo que se muestra.
   * Pero con el margen no alcanza con eso para hacer cuentas: el punto de
   * equilibrio es `costos fijos ÷ margen`, y en dólares un margen real de 0,1256
   * se redondea a 0,13. Es un 3,5% de error que va derecho al denominador, y
   * además hace que el resultado dependa de la moneda en que se mire: en pesos el
   * mismo margen es 181,43 y el redondeo ya no pesa. Un punto de equilibrio que
   * cambia al cambiar de moneda es un número que nadie debería creer.
   */
  exacto: {
    ingreso: number;
    costo: number;
    margen: number;
  };
  comisionPct: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Un número usable, o cero.
 *
 * `Number(x) || 0` no alcanza: deja pasar `Infinity`, que no es falsy. Un
 * Infinity en el ticket se propaga a todo el resto y la pantalla termina
 * mostrando "$Infinity" o "NaN" donde debería ir plata. Pasa de verdad: un
 * campo del plan guardado mal, una división por cero aguas arriba.
 *
 * Se recorta a positivo porque ninguno de estos campos tiene sentido negativo:
 * un ticket de -5 no es un descuento, es un dato roto.
 */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * La comisión por defecto sale del código, no del plan.
 *
 * El plan tiene un campo `comision` editable y eso está bien para explorar
 * escenarios, pero el valor por defecto tiene que ser el que se cobra de
 * verdad. Durante meses el plan decía 12% mientras el código cobraba 10%, y
 * cualquier proyección hecha con ese plan sobreestimaba el ingreso un 20%.
 */
export function calcularUnidad(s: SupuestosUnidad): UnidadEconomica {
  const ticket = num(s.ticket);
  const contratos = num(s.contratos);
  const comisionPct = num(s.comisionPct) || COMMISSION_RATES.free;

  const volumen = ticket * contratos;
  const ingreso = volumen * (comisionPct / 100);

  const costoSoporte = num(s.soporte);
  const costoDisputas = volumen * (num(s.disputasPct) / 100);
  const costoFraude = volumen * (num(s.fraudePct) / 100);
  const costoTotal = costoSoporte + costoDisputas + costoFraude;

  return {
    volumen: r2(volumen),
    ingreso: r2(ingreso),
    costoSoporte: r2(costoSoporte),
    costoDisputas: r2(costoDisputas),
    costoFraude: r2(costoFraude),
    costoTotal: r2(costoTotal),
    margen: r2(ingreso - costoTotal),
    porContrato: {
      ingreso: r2(contratos > 0 ? ingreso / contratos : 0),
      costo: r2(contratos > 0 ? costoTotal / contratos : 0),
      margen: r2(contratos > 0 ? (ingreso - costoTotal) / contratos : 0),
    },
    exacto: {
      ingreso,
      costo: costoTotal,
      margen: ingreso - costoTotal,
    },
    comisionPct,
  };
}

/**
 * Cuántos usuarios activos por mes hacen falta para cubrir los costos fijos.
 *
 * Recibe el margen EXACTO (`unidad.exacto.margen`), nunca el redondeado: ver el
 * comentario de `exacto`. Devuelve `null` cuando el margen no es positivo, porque
 * entonces no hay cantidad de usuarios que alcance —cada usuario nuevo agrega
 * pérdida—, y un número negativo o infinito mostrado como "usuarios necesarios"
 * es peor que decir que no hay.
 */
export function mauDeEquilibrio(fijos: number, margenExacto: number): number | null {
  if (!Number.isFinite(margenExacto) || margenExacto <= 0) return null;
  return Math.ceil(num(fijos) / margenExacto);
}

/**
 * LTV/CAC a partir del cual se considera sano un cliente adquirido.
 *
 * Es la referencia habitual en software: cada cliente tiene que devolver al
 * menos tres veces lo que costó conseguirlo. La usa el diagnóstico del servidor,
 * la tabla de escenarios de la pantalla y la guía del análisis, y por eso vive
 * acá: una cifra que aparece en tres lugares termina siendo tres cifras.
 */
export const REFERENCIA_LTV_CAC = 3;

/**
 * Cuánto se aparta el churn de los escenarios pesimista y optimista del churn
 * del plan, y entre qué valores se lo acota.
 *
 * El moderado ES el del plan; los otros dos se derivan de él para que corregir
 * el supuesto los mueva juntos. Los factores son anchos a propósito: en un
 * marketplace de oficios la frecuencia de uso es baja por naturaleza, así que el
 * rango honesto de churn es amplio.
 */
export const FACTORES_DE_CHURN = {
  pesimista: 1.5,
  optimista: 0.6,
  /** Churn máximo, en %. */
  tope: 95,
  /** Churn mínimo, en %: con 0 el LTV sería infinito. */
  piso: 0.5,
} as const;

/** Meses de runway que se pide tener antes de lanzar la Fase 1. */
export const META_RUNWAY_FASE1_MESES = 4;

/**
 * Los supuestos con que arranca la sección de unit economics de un plan nuevo.
 *
 * Los usa el plan por defecto del servidor y los usa la guía para armar su
 * ejemplo, así que el ejemplo que se lee es siempre la cuenta de verdad con los
 * números de verdad. El porqué de cada valor está en el plan por defecto
 * (`server/routes/admin/businessPlan.ts`).
 */
export const SUPUESTOS_UE_DE_ARRANQUE = {
  comision: COMMISSION_RATES.free,
  ticket: 21,
  contratos: 0.8,
  disputas: 2.5,
  soporte: 1,
  fijos: 18000,
  fraude: 0.8,
  mauActual: 0,
} as const;

/**
 * Lo que el código cree que cuesta procesar un contrato más.
 *
 * Vive en `minimums.ts` y lo usa el mínimo de ampliación, así que no es un
 * número de adorno: con él se decide cuánto es lo mínimo que se puede cobrar.
 * Se expone acá para poder comparar: si los supuestos del plan dan un costo
 * muy distinto, alguno de los dos está mal y conviene enterarse.
 */
export const COSTO_MARGINAL_SEGUN_EL_CODIGO = MARGINAL_COST_PER_CONTRACT_ARS;

/**
 * Si los supuestos del plan se alejaron del costo que usa el código.
 *
 * Devuelve `null` cuando están en el mismo orden de magnitud. No corrige el
 * plan por su cuenta: cuál de los dos es el correcto lo sabe quien lo cargó, y
 * la decisión de alinearlos es suya.
 */
export function discrepanciaDeCosto(
  costoPorContratoDelPlan: number,
  costoDelCodigo = COSTO_MARGINAL_SEGUN_EL_CODIGO,
): string | null {
  if (num(costoPorContratoDelPlan) === 0) return null;
  if (costoDelCodigo <= 0) return null;

  const veces = costoPorContratoDelPlan / costoDelCodigo;
  // Hasta el triple se acepta sin ruido: son estimaciones, no mediciones.
  if (veces <= 3 && veces >= 1 / 3) return null;

  const mas = veces > 1;
  return (
    `Los supuestos del plan dan $${Math.round(costoPorContratoDelPlan).toLocaleString('es-AR')} de costo ` +
    `por contrato, ${mas ? `${veces.toFixed(1)}× más` : `${(1 / veces).toFixed(1)}× menos`} que los ` +
    `$${costoDelCodigo.toLocaleString('es-AR')} que usa el código para calcular el mínimo de ampliación ` +
    `(shared/pricing/minimums.ts). Uno de los dos está mal: con esta diferencia, el mínimo que cobra la ` +
    `plataforma y el margen que proyecta el plan describen negocios distintos.`
  );
}
