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
    comisionPct,
  };
}

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
