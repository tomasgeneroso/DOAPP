import {
  convertirMoneda,
  editarImporteUe,
  type ImportesUe,
  type Moneda,
  type PlanConImportesUe,
} from './conversionMoneda.js';
import { totalesPorTipo, type FilaDeGasto } from './gastos.js';

/**
 * Los bloques del plan, coordinados.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 *
 * El plan tenía tres bloques que describen el mismo negocio y cada uno con sus
 * propios números: el presupuesto de gastos, la economía unitaria (ticket,
 * contratos, soporte, costos fijos) y la proyección (otro ticket, otros contratos
 * por usuario, otros costos fijos). Cargaban lo mismo dos y tres veces, y no
 * coincidían: la economía unitaria usaba un ticket de US$21 y la proyección de
 * €22; los costos fijos de un bloque eran US$7.600 (todo el presupuesto) y los del
 * otro €430,5 (con la publicidad adentro, que además se contaba otra vez como
 * adquisición). El resultado era un informe que contradecía a la pantalla de al
 * lado, sin que nada avisara.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 *
 * Cada número se carga UNA sola vez, en el bloque al que pertenece, y los demás
 * lo derivan:
 *
 *   gastos de la beta ──────────┐
 *   gastos de la etapa real ────┼─► proyección (altas, costos fijos, beta)
 *   unit economics ─────────────┘     (ticket, contratos, comisión, soporte…)
 *
 * `coordinarPlan` hace esa derivación. Escribe los valores derivados en los
 * mismos campos donde antes se cargaban a mano (`projection.revenue.ticket`,
 * `projection.costs.fijosMensuales`, `ue.fijos`…), de modo que todo lo que ya
 * lee esos campos —la proyección, el informe, el servicio que compara el plan
 * con lo real— los recibe coherentes sin cambiar. Se llama al cargar el plan,
 * en cada edición y al leerlo en el servidor; es idempotente.
 *
 * Los campos pisados quedan guardados, pero nunca se leen como entrada: lo que
 * escriba ahí un plan viejo se reemplaza por lo derivado.
 */

/** La comisión durante la beta. Hoy no se cobra: ver server/services/platformPhase.ts. */
export const COMISION_EN_BETA_PCT = 0;

export const MESES_DE_BETA_MAXIMOS = 24;

/**
 * De cada 100 usuarios registrados, cuántos usan la plataforma en un mes.
 *
 * Un usuario ACTIVO es el que contrató al menos una vez en los últimos 30 días
 * (es lo que mide la economía unitaria, y por eso ahí los contratos por usuario
 * no bajan de 0,5). La proyección cuenta usuarios REGISTRADOS: los que se dieron
 * de alta y no se fueron, hayan contratado este mes o no. Para pasar de uno a
 * otro hace falta este porcentaje; sin él, la proyección multiplicaba la base de
 * registrados por el ritmo de los activos y sobreestimaba cinco veces los ingresos.
 */
export const ACTIVOS_PCT_POR_DEFECTO = 20;

export interface EtapaBetaDelPlan {
  meses: number;
  comisionPct: number;
  altasPorMes: number;
  fijosMensuales: number;
  soportePorUsuario: number;
}

/** La parte del plan que toca esta lógica. El plan real tiene muchos campos más. */
export interface PlanCoordinable extends PlanConImportesUe {
  budgetCurrency: Moneda;
  budget: FilaDeGasto[];
  /** Ausentes en los planes guardados antes de que existiera la etapa real. */
  budgetRealCurrency?: Moneda;
  budgetReal?: FilaDeGasto[];
  betaMeses?: number;
  projectionCurrency: Moneda;
  ue: ImportesUe & { comision: number; contratos: number; disputas: number; fraude: number };
  projection: {
    growth: {
      modoCrecimiento: 'porcentaje' | 'absoluto';
      altasPorMes: number;
      horizonteMeses: number;
      activosPct?: number;
    };
    revenue: {
      ticket: number;
      contratosPorUsuario: number;
      comisionPct: number;
      membresiaPrecio: number;
      publicidadMensual: number;
    };
    costs: {
      soportePorUsuario: number;
      infraPorUsuario: number;
      disputasPct: number;
      fraudePct: number;
      cac: number;
      fijosMensuales: number;
    };
    beta?: EtapaBetaDelPlan;
  };
}

export type CodigoDeAviso =
  | 'publicidad-sin-cac'
  | 'publicidad-sin-uso'
  | 'soporte-sin-sumar'
  | 'etapa-real-vacia';

export interface Aviso {
  codigo: CodigoDeAviso;
  /** El monto del que habla el aviso, en `moneda`. */
  monto: number;
  moneda: Moneda;
}

/** Lo que se derivó, ya en la moneda de la proyección, para mostrarlo con su origen. */
export interface DerivadosDelPlan {
  moneda: Moneda;
  betaMeses: number;
  beta: {
    /** Lo que se gasta por mes y no depende de la gente: fijos y soporte manual. */
    fijos: number;
    pauta: number;
    altasPorMes: number;
  };
  real: {
    fijos: number;
    pauta: number;
    altasPorMes: number;
    /** Soporte cargado como monto fijo que NO se suma: se calcula por usuario. */
    soporteSinSumar: number;
  };
  activosPct: number;
  avisos: Aviso[];
}

const redondear = (n: number) => Number(Number(n).toPrecision(9));

const esMoneda = (m: unknown): m is Moneda => m === 'ARS' || m === 'USD' || m === 'EUR';

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Argentina no tiene horario de verano: UTC−3 todo el año. Los meses se cuentan en
 * hora argentina porque la fecha de cierre de la beta está fijada así
 * (`2026-12-31T23:59:59-03:00`): en UTC ese instante ya es el 1° de enero, y
 * contarlo en UTC sumaba un mes de beta que no existe (4 en lugar de 3).
 */
const DESFASE_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const enHoraArgentina = (d: Date) => new Date(d.getTime() + DESFASE_ARGENTINA_MS);

/**
 * Cuántos meses de beta quedan, contando el mes en curso, hasta la fecha de cierre
 * (los dos en hora argentina). Si la beta ya terminó son 0.
 */
export function mesesHastaFinDeBeta(ahora: Date, fin: Date): number {
  const a = enHoraArgentina(ahora);
  const f = enHoraArgentina(fin);
  const meses =
    (f.getUTCFullYear() - a.getUTCFullYear()) * 12 + (f.getUTCMonth() - a.getUTCMonth()) + 1;
  return acotar(meses, 0, MESES_DE_BETA_MAXIMOS);
}

/** Los rubros de la etapa real: los guardados, o una copia de los de la beta. */
export function rubrosDeLaEtapaReal(plan: Pick<PlanCoordinable, 'budget' | 'budgetReal'>): FilaDeGasto[] {
  return Array.isArray(plan.budgetReal)
    ? plan.budgetReal
    : (plan.budget || []).map((f) => ({ ...f }));
}

/**
 * Deriva los números de la proyección a partir de los demás bloques y los deja
 * escritos en el plan. Muta `plan` y devuelve de dónde salió cada cosa.
 */
export function coordinarPlan(plan: PlanCoordinable): DerivadosDelPlan {
  const moneda = esMoneda(plan.projectionCurrency) ? plan.projectionCurrency : 'EUR';
  const aProy = (monto: number, desde: Moneda) => redondear(convertirMoneda(monto, desde, moneda, plan));

  // --- la etapa real nace como copia de la beta, y desde ahí es suya -----------
  if (!Array.isArray(plan.budgetReal)) plan.budgetReal = rubrosDeLaEtapaReal(plan);
  if (!esMoneda(plan.budgetRealCurrency)) plan.budgetRealCurrency = plan.budgetCurrency;
  const monedaReal = plan.budgetRealCurrency;

  const betaMeses = acotar(Math.round(Number(plan.betaMeses) || 0), 0, MESES_DE_BETA_MAXIMOS);
  plan.betaMeses = betaMeses;

  const beta = totalesPorTipo(plan.budget);
  const real = totalesPorTipo(plan.budgetReal);

  // --- economía unitaria: los costos fijos son los de la etapa real ------------
  editarImporteUe(plan, 'fijos', real.fijo, monedaReal);

  // --- de la economía unitaria (por usuario ACTIVO) a la proyección (por registrado)
  const activosPct = acotar(
    Number.isFinite(Number(plan.projection.growth.activosPct))
      ? Number(plan.projection.growth.activosPct)
      : ACTIVOS_PCT_POR_DEFECTO,
    0,
    100,
  );
  const activos = activosPct / 100;
  const { growth, revenue, costs } = plan.projection;
  const ue = plan.ue;

  growth.activosPct = activosPct;
  growth.horizonteMeses = 120;
  revenue.ticket = aProy(ue.ticket, plan.ueCurrency);
  revenue.comisionPct = ue.comision;
  revenue.contratosPorUsuario = redondear(ue.contratos * activos);
  costs.soportePorUsuario = redondear(aProy(ue.soporte, plan.ueCurrency) * activos);
  costs.disputasPct = ue.disputas;
  costs.fraudePct = ue.fraude;
  costs.fijosMensuales = aProy(real.fijo, monedaReal);

  // --- la publicidad compra usuarios: altas = pauta ÷ CAC -----------------------
  // El CAC es MEZCLADO: pauta ÷ todos los usuarios nuevos, vengan de un anuncio o
  // de boca en boca. Por eso no hay un campo aparte de altas orgánicas.
  const cac = Number(costs.cac) || 0;
  const pautaBeta = aProy(beta.adquisicion, plan.budgetCurrency);
  const pautaReal = aProy(real.adquisicion, monedaReal);
  const altasBeta = cac > 0 ? redondear(pautaBeta / cac) : 0;
  const altasReal = cac > 0 ? redondear(pautaReal / cac) : 0;
  growth.altasPorMes = altasReal;

  // --- la beta -------------------------------------------------------------------
  // Con pocos usuarios el soporte se atiende a mano y es un monto fijo: en la beta
  // cuenta como costo fijo. En la etapa real se calcula por usuario.
  const fijosBeta = aProy(beta.fijo + beta.soporte, plan.budgetCurrency);
  plan.projection.beta = {
    meses: betaMeses,
    comisionPct: COMISION_EN_BETA_PCT,
    altasPorMes: altasBeta,
    fijosMensuales: fijosBeta,
    soportePorUsuario: 0,
  };

  // --- lo que el modelo NO usa, dicho en voz alta --------------------------------
  const avisos: Aviso[] = [];
  if (cac <= 0 && (pautaBeta > 0 || pautaReal > 0)) {
    avisos.push({ codigo: 'publicidad-sin-cac', monto: Math.max(pautaBeta, pautaReal), moneda });
  }
  if (growth.modoCrecimiento === 'porcentaje' && pautaReal > 0) {
    avisos.push({ codigo: 'publicidad-sin-uso', monto: pautaReal, moneda });
  }
  const soporteSinSumar = aProy(real.soporte, monedaReal);
  if (soporteSinSumar > 0) {
    avisos.push({ codigo: 'soporte-sin-sumar', monto: soporteSinSumar, moneda });
  }
  if (real.total <= 0) {
    avisos.push({ codigo: 'etapa-real-vacia', monto: 0, moneda });
  }

  return {
    moneda,
    betaMeses,
    beta: { fijos: fijosBeta, pauta: pautaBeta, altasPorMes: altasBeta },
    real: { fijos: costs.fijosMensuales, pauta: pautaReal, altasPorMes: altasReal, soporteSinSumar },
    activosPct,
    avisos,
  };
}

/**
 * Cambia la moneda de la proyección convirtiendo los importes que se cargan a
 * mano en ella. Los derivados no hace falta tocarlos: `coordinarPlan` los
 * recalcula en la moneda nueva.
 *
 * Sin esto, pasar la proyección de euros a dólares dejaba "CAC 4" como 4 dólares
 * mientras que el ticket derivado se convertía solo: el mismo error que tenía la
 * unidad económica, con sus números moviéndose a medias.
 */
export function cambiarMonedaDeLaProyeccion(plan: PlanCoordinable, nueva: Moneda): void {
  const actual = esMoneda(plan.projectionCurrency) ? plan.projectionCurrency : 'EUR';
  if (actual === nueva) return;
  const pasar = (n: number) => redondear(convertirMoneda(Number(n) || 0, actual, nueva, plan));
  const { costs, revenue } = plan.projection;
  costs.cac = pasar(costs.cac);
  costs.infraPorUsuario = pasar(costs.infraPorUsuario);
  revenue.membresiaPrecio = pasar(revenue.membresiaPrecio);
  revenue.publicidadMensual = pasar(revenue.publicidadMensual);
  plan.projectionCurrency = nueva;
}
