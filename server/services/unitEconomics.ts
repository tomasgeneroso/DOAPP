import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import currencyExchange from './currencyExchange.js';
import { getPlatformPhase } from './platformPhase.js';
import { COMMISSION_RATES } from '../../shared/constants/membershipPricing.js';
import {
  calcularUnidad,
  discrepanciaDeCosto,
  FACTORES_DE_CHURN,
  REFERENCIA_LTV_CAC,
} from '../../shared/pricing/unidadEconomica.js';

/**
 * Las métricas de adquisición y retención: CAC, LTV, LTV/CAC, payback, runway.
 *
 * Qué hace esto que no hace `liveFinancials`: aquél mide el mes —cuánto entró,
 * cuánto falta para cubrir los gastos—. Esto mide si el negocio cierra: si
 * conseguir un cliente cuesta menos de lo que ese cliente deja, y en cuánto
 * tiempo se recupera lo gastado en conseguirlo. Son preguntas distintas y la
 * segunda es la que decide si tiene sentido poner más plata en pauta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * La regla de este archivo: un número que no se puede calcular NO se calcula.
 *
 * Es la tentación central de un tablero financiero en una app que todavía no
 * lanzó. Con cero clientes, el CAC es una división por cero y el LTV es una
 * proyección sobre una retención que nadie midió. Rellenar eso con supuestos
 * produce un tablero que se ve completo, del que nadie recuerda seis meses
 * después qué parte era medición y qué parte era deseo —y entonces se toman
 * decisiones de presupuesto sobre números inventados—.
 *
 * Por eso cada métrica viene envuelta en `Metrica<T>`: o tiene valor, o dice
 * por qué no lo tiene y qué haría falta para tenerlo. Un "no sé todavía"
 * explícito es información; un cero es una mentira con formato de dato.
 * ────────────────────────────────────────────────────────────────────────────
 */

const diasAtras = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const redondear = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

/** Un número, o la razón por la que todavía no hay número. */
export interface Metrica<T = number> {
  valor: T | null;
  /** Qué falta para poder calcularlo. Vacío cuando sí se pudo. */
  motivo?: string;
  /** De dónde salió: medido en la base, o supuesto del plan. */
  origen: 'medido' | 'supuesto' | 'mixto' | 'sin-datos';
}

const medido = <T>(valor: T): Metrica<T> => ({ valor, origen: 'medido' });
const supuesto = <T>(valor: T): Metrica<T> => ({ valor, origen: 'supuesto' });
const mixto = <T>(valor: T): Metrica<T> => ({ valor, origen: 'mixto' });
const sinDatos = <T>(motivo: string): Metrica<T> => ({ valor: null, motivo, origen: 'sin-datos' });

export type Escenario = 'pesimista' | 'moderado' | 'optimista';

export interface UnitEconomics {
  calculadoEn: string;
  moneda: 'ARS';
  eurArs: number;

  /**
   * Lo primero que hay que leer. Si la plataforma está en beta, la comisión es
   * 0% y ninguna métrica de valor del cliente puede dar positiva, porque no se
   * cobra nada. No es un problema del negocio: es la fase. Pero un LTV de cero
   * leído sin este contexto parece una catástrofe, y leído con él es una
   * decisión.
   */
  contexto: {
    fase: string;
    comisionVigentePct: number;
    comisionPostBetaPct: number;
    /** Lo que impide medir de verdad, en una frase. */
    advertencia: string | null;
    /**
     * Cuando los supuestos de costo del plan se alejaron del costo que el
     * codigo usa de verdad para calcular el minimo de ampliacion. Son dos
     * numeros que describen lo mismo y tienen que parecerse.
     */
    costoFueraDeRango: string | null;
    /**
     * Cuando el plan se contradice consigo mismo. No se corrige por nuestra
     * cuenta ni se elige en silencio: se dice cuál se usó y cuál quedó afuera,
     * porque la discrepancia es del plan y arreglarla es una decisión del owner.
     */
    inconsistenciaDelPlan: string | null;
  };

  adquisicion: {
    /** Gasto mensual en marketing y ventas, del plan. */
    gastoMarketingMensual: Metrica;
    /** Altas de usuarios en los últimos 30 días. */
    altas30: Metrica;
    /** De esas altas, las que además hicieron al menos un contrato. */
    altasQueTransaccionaron30: Metrica;
    /** Gasto / altas. El barato y el que engaña. */
    cacPorRegistro: Metrica;
    /** Gasto / altas que transaccionaron. El que importa. */
    cacPorClienteReal: Metrica;
  };

  valor: {
    ticketPromedio: Metrica;
    contratosPorUsuarioMes: Metrica;
    /**
     * De dónde sale cada peso de la contribución. Sin esto, un LTV negativo
     * es un número que asusta y no explica: con esto se ve que el problema es
     * que atender un contrato cuesta más que la comisión que deja.
     */
    desglosePorContrato: {
      ticket: number;
      comisionGanada: number;
      costoVariable: number;
      margen: number;
    } | null;
    /** Lo que deja un usuario activo por mes, después de costos variables. */
    contribucionMensual: Metrica;
    /** Bajas mensuales, en porcentaje. */
    churnMensualPct: Metrica;
    /** LTV en los tres escenarios. */
    ltv: Record<Escenario, Metrica>;
    /** El churn usado en cada escenario, para que el número sea auditable. */
    churnPorEscenario: Record<Escenario, number>;
  };

  salud: {
    ltvSobreCac: Record<Escenario, Metrica>;
    /** Meses hasta recuperar lo gastado en conseguir al cliente. */
    paybackMeses: Metrica;
    /** El estándar de la industria, para comparar sin buscarlo. */
    referenciaLtvCac: number;
    veredicto: string;
  };

  caja: {
    disponible: Metrica;
    quemaMensual: Metrica;
    runwayMeses: Metrica;
  };

  retencion: {
    /** Por mes de alta: cuántos volvieron a contratar en los meses siguientes. */
    cohortes: Array<{
      mes: string;
      altas: number;
      activosM1: number;
      activosM2: number;
      activosM3: number;
    }>;
    /** Lo que se puede decir de la retención hoy. */
    diagnostico: string;
  };
}

/**
 * El churn de cada escenario.
 *
 * El moderado sale del plan (lo puso el owner). El pesimista y el optimista se
 * derivan de él, no se escriben aparte: si alguien corrige el supuesto del
 * plan, los tres se mueven juntos. Tres números sueltos terminan
 * contradiciéndose.
 *
 * Los factores son amplios a propósito. En un marketplace de oficios la
 * frecuencia de uso es baja por naturaleza —a un plomero no se lo llama todos
 * los meses— así que el rango honesto de churn es ancho, y fingir precisión
 * sería peor que declarar la incertidumbre.
 */
function churnDeEscenarios(churnBase: number): Record<Escenario, number> {
  const { pesimista, optimista, tope, piso } = FACTORES_DE_CHURN;
  const base = Math.min(Math.max(churnBase, piso), tope);
  return {
    pesimista: redondear(Math.min(base * pesimista, tope), 1),
    moderado: redondear(base, 1),
    optimista: redondear(Math.max(base * optimista, piso), 1),
  };
}

interface EntradasDelPlan {
  gastoMarketingMensualArs: number;
  costosFijosMensualesArs: number;
  cajaDisponibleArs: number;
  churnPlanPct: number;
  /**
   * Ticket y frecuencia del bloque de unit economics del plan, en la misma
   * moneda que los costos variables de ese bloque.
   *
   * Importa que salgan de ahí y no de `projection.revenue`: el plan tiene DOS
   * tickets —uno en el bloque de unit economics y otro en la proyección— y no
   * coinciden. Tomar el ticket de un modelo y los costos del otro da un número
   * que parece razonable y no describe nada. Cuál gana está decidido acá, y la
   * discrepancia se informa en vez de taparse.
   */
  ticketUeArs: number;
  contratosPorUsuarioUe: number;
  /** Importe fijo por usuario y por mes. */
  soporteArs: number;
  /** Porcentajes del volumen, no importes. */
  disputasPct: number;
  fraudePct: number;
  /** El ticket del otro bloque, sólo para poder avisar si difieren. */
  ticketProyeccionArs: number;
}

/**
 * Lo que el owner cargó en la proyección, convertido a pesos.
 *
 * El plan mezcla monedas a propósito (la pauta se compra en dólares, la
 * constitución se paga en pesos), así que acá se normaliza todo a ARS antes de
 * dividir nada. Dividir un gasto en dólares por usuarios y comparar contra un
 * ticket en pesos es la clase de error que da un resultado plausible.
 */
async function leerPlan(plan: any, eurArs: number): Promise<EntradasDelPlan> {
  const usdArs = await currencyExchange.getUSDtoARSRate().catch(() => eurArs / 1.08);

  const aArs = (monto: number, moneda: string): number => {
    const n = Number(monto) || 0;
    if (moneda === 'ARS') return n;
    if (moneda === 'USD') return n * usdArs;
    if (moneda === 'EUR') return n * eurArs;
    return n;
  };

  const budget: Array<{ c?: string; m?: number }> = Array.isArray(plan?.budget) ? plan.budget : [];
  const budgetCurrency = plan?.budgetCurrency || 'USD';

  /**
   * Qué cuenta como gasto de adquisición.
   *
   * Sólo las líneas que compran clientes. Meter la infraestructura o el
   * abogado adentro del CAC infla el costo de adquirir y hace parecer que la
   * pauta no rinde, cuando lo que pasa es que se está contando el alquiler
   * como si fuera publicidad.
   */
  const ES_ADQUISICION = /ads?|adquisi|marketing|pauta|publicidad|ventas/i;
  const gastoMarketing = budget
    .filter((b) => ES_ADQUISICION.test(String(b.c || '')))
    .reduce((acc, b) => acc + aArs(Number(b.m) || 0, budgetCurrency), 0);

  const costosFijos = budget.reduce((acc, b) => acc + aArs(Number(b.m) || 0, budgetCurrency), 0);

  const ue = plan?.ue || {};
  const growth = plan?.projection?.growth || {};
  const revenue = plan?.projection?.revenue || {};
  const projectionCurrency = plan?.projectionCurrency || 'EUR';

  const ueCurrency = plan?.ueCurrency || 'USD';

  return {
    gastoMarketingMensualArs: Math.round(gastoMarketing),
    costosFijosMensualesArs: Math.round(costosFijos),
    cajaDisponibleArs: Math.round(aArs(Number(plan?.capitalInicial) || 0, plan?.capitalCurrency || 'ARS')),
    churnPlanPct: Number(growth?.churnPct) || 0,

    // Ticket, frecuencia y costos: los tres del MISMO bloque y la MISMA moneda.
    ticketUeArs: Math.round(aArs(Number(ue?.ticket) || 0, ueCurrency)),
    contratosPorUsuarioUe: Number(ue?.contratos) || 0,
    /**
     * Los supuestos de costo, crudos.
     *
     * Antes acá se sumaban los tres como si fueran importes en dólares. Está
     * mal: `soporte` es un importe fijo por usuario y por mes, pero
     * `disputas` y `fraude` son PORCENTAJES del volumen —así los usa la
     * pantalla de la proyección desde siempre—. Sumarlos daba un costo por
     * contrato de $17.628 donde el real era otro, y el error se mostraba como
     * un dato.
     *
     * Ahora se pasan crudos a `calcularUnidad`, que es la única fórmula.
     */
    soporteArs: Math.round(aArs(Number(ue?.soporte) || 0, ueCurrency)),
    disputasPct: Number(ue?.disputas) || 0,
    fraudePct: Number(ue?.fraude) || 0,

    ticketProyeccionArs: Math.round(aArs(Number(revenue?.ticket) || 0, projectionCurrency)),
  };
}

/** Retención por cohorte: de los que se registraron en un mes, cuántos volvieron. */
async function cohortes(): Promise<UnitEconomics['retencion']['cohortes']> {
  /**
   * Una sola consulta en vez de una por mes. No es optimización prematura: con
   * doce meses y tres ventanas cada uno serían treinta y seis consultas en una
   * pantalla que alguien abre todos los días.
   */
  const [filas]: any = await sequelize.query(`
    WITH altas AS (
      SELECT id, date_trunc('month', created_at) AS mes_alta
      FROM users
      WHERE created_at >= now() - interval '12 months'
    ),
    actividad AS (
      SELECT client_id AS user_id, date_trunc('month', created_at) AS mes FROM contracts
      WHERE created_at >= now() - interval '12 months'
      UNION
      SELECT doer_id AS user_id, date_trunc('month', created_at) AS mes FROM contracts
      WHERE created_at >= now() - interval '12 months'
    )
    SELECT
      to_char(a.mes_alta, 'YYYY-MM') AS mes,
      count(DISTINCT a.id)::int AS altas,
      count(DISTINCT CASE WHEN act.mes = a.mes_alta + interval '1 month' THEN a.id END)::int AS m1,
      count(DISTINCT CASE WHEN act.mes = a.mes_alta + interval '2 month' THEN a.id END)::int AS m2,
      count(DISTINCT CASE WHEN act.mes = a.mes_alta + interval '3 month' THEN a.id END)::int AS m3
    FROM altas a
    LEFT JOIN actividad act ON act.user_id = a.id
    GROUP BY a.mes_alta
    ORDER BY a.mes_alta DESC
    LIMIT 12
  `);

  return (filas || []).map((f: any) => ({
    mes: f.mes,
    altas: Number(f.altas) || 0,
    activosM1: Number(f.m1) || 0,
    activosM2: Number(f.m2) || 0,
    activosM3: Number(f.m3) || 0,
  }));
}

export async function getUnitEconomics(plan: any): Promise<UnitEconomics> {
  const eurArs = await currencyExchange
    .getEURtoARSRate()
    .catch(() => 1700);

  const entradas = await leerPlan(plan, eurArs);
  const fase = await getPlatformPhase().catch(() => 'beta' as const);
  const enBeta = fase === 'beta';

  const desde30 = diasAtras(30);

  // ── Medición ────────────────────────────────────────────────────────────
  const [altas30, contratosCompletados, agregados, transaccionaron] = await Promise.all([
    User.count({ where: { createdAt: { [Op.gte]: desde30 } } }),

    Contract.count({ where: { status: 'completed', updatedAt: { [Op.gte]: desde30 } } }),

    Contract.findOne({
      where: { status: 'completed', updatedAt: { [Op.gte]: desde30 } },
      attributes: [
        [fn('AVG', col('price')), 'ticket'],
        [fn('SUM', col('commission')), 'comision'],
      ],
      raw: true,
    }) as any,

    /**
     * Usuarios dados de alta en los últimos 30 días que además contrataron.
     *
     * Es el denominador honesto del CAC. Un registro que nunca transacciona no
     * es un cliente: es una dirección de correo. Medir el CAC contra registros
     * da un número lindo y engañoso, y es el error clásico de los marketplaces
     * en lanzamiento.
     */
    Contract.count({
      distinct: true,
      col: 'clientId',
      where: { createdAt: { [Op.gte]: desde30 } },
      include: [
        {
          model: User,
          as: 'client',
          required: true,
          attributes: [],
          where: { createdAt: { [Op.gte]: desde30 } },
        },
      ],
    }).catch(() => 0),
  ]);

  const usuariosTotal = await User.count();
  const ticketMedido = Math.round(Number(agregados?.ticket) || 0);

  // ── Adquisición ─────────────────────────────────────────────────────────
  const gasto = entradas.gastoMarketingMensualArs;

  const gastoM: Metrica =
    gasto > 0
      ? supuesto(gasto)
      : sinDatos('No hay ninguna línea de adquisición cargada en el presupuesto del plan.');

  const cacPorRegistro: Metrica =
    gasto <= 0
      ? sinDatos('Falta el gasto mensual de adquisición en el plan.')
      : altas30 <= 0
        ? sinDatos('No hubo altas en los últimos 30 días: no hay contra qué dividir el gasto.')
        : mixto(Math.round(gasto / altas30));

  const cacPorClienteReal: Metrica =
    gasto <= 0
      ? sinDatos('Falta el gasto mensual de adquisición en el plan.')
      : transaccionaron <= 0
        ? sinDatos(
            'Ninguna de las altas de los últimos 30 días contrató todavía. Hasta que alguien ' +
              'transaccione, el costo por cliente real no existe — sólo el costo por registro.',
          )
        : mixto(Math.round(gasto / transaccionaron));

  // ── Valor ───────────────────────────────────────────────────────────────
  const comisionVigentePct = enBeta ? 0 : COMMISSION_RATES.free;

  const ticket: Metrica =
    ticketMedido > 0
      ? medido(ticketMedido)
      : entradas.ticketUeArs > 0
        ? supuesto(entradas.ticketUeArs)
        : sinDatos('No hay contratos completados ni ticket estimado en el plan.');

  const contratosPorUsuario: Metrica =
    usuariosTotal > 0 && contratosCompletados > 0
      ? medido(redondear(contratosCompletados / usuariosTotal, 3))
      : entradas.contratosPorUsuarioUe > 0
        ? supuesto(entradas.contratosPorUsuarioUe)
        : sinDatos('Sin contratos completados y sin supuesto de frecuencia en el plan.');

  /**
   * Contribución mensual por usuario activo.
   *
   * ingreso por contrato = ticket × comisión
   * menos el costo variable de atender ese contrato (soporte, disputas, fraude)
   * por la cantidad de contratos que hace un usuario en un mes.
   */
  /**
   * La cuenta la hace `calcularUnidad`, que es la misma que usa la pantalla de
   * la proyección. Antes estaba escrita acá otra vez, y las dos versiones no
   * coincidían: ésta sumaba `disputas` y `fraude` como importes cuando son
   * porcentajes del volumen.
   */
  const supuestos =
    ticket.valor !== null && contratosPorUsuario.valor !== null
      ? {
          ticket: ticket.valor,
          contratos: contratosPorUsuario.valor,
          soporte: entradas.soporteArs,
          disputasPct: entradas.disputasPct,
          fraudePct: entradas.fraudePct,
        }
      : null;

  /** Con la comisión que rige hoy (0% en beta). */
  const unidadHoy = supuestos ? calcularUnidad({ ...supuestos, comisionPct: comisionVigentePct }) : null;

  /** Con la comisión post-beta: es la pregunta que importa hoy. */
  const unidadPostBeta = supuestos
    ? calcularUnidad({ ...supuestos, comisionPct: COMMISSION_RATES.free })
    : null;

  let contribucion: Metrica;
  if (enBeta) {
    contribucion = sinDatos(
      'Durante la beta la comisión es 0%, así que un usuario activo no deja margen por ' +
        'definición. No es un problema del negocio: es la fase. Abajo se modela cuánto sería ' +
        `con la comisión del ${COMMISSION_RATES.free}% que rige al cerrarla.`,
    );
  } else if (unidadHoy) {
    contribucion = mixto(Math.round(unidadHoy.margen));
  } else {
    contribucion = sinDatos('Falta el ticket o la frecuencia de contratación.');
  }

  const margenPorContrato = unidadPostBeta ? Math.round(unidadPostBeta.porContrato.margen) : null;

  const desglosePorContrato = unidadPostBeta
    ? {
        ticket: ticket.valor as number,
        comisionGanada: Math.round(unidadPostBeta.porContrato.ingreso),
        costoVariable: Math.round(unidadPostBeta.porContrato.costo),
        margen: margenPorContrato as number,
      }
    : null;

  const contribucionPostBeta = unidadPostBeta ? Math.round(unidadPostBeta.margen) : null;

  const churnEscenarios = churnDeEscenarios(entradas.churnPlanPct || 12);

  const churn: Metrica =
    entradas.churnPlanPct > 0
      ? supuesto(entradas.churnPlanPct)
      : sinDatos('No hay churn cargado en el plan ni suficientes cohortes para medirlo.');

  /**
   * LTV = contribución mensual / churn mensual.
   *
   * Se usa la contribución post-beta y no la vigente: con 0% de comisión los
   * tres escenarios darían cero y la tabla no diría nada. Lo que se está
   * respondiendo es "cuánto valdría un cliente cuando empecemos a cobrar", que
   * es la pregunta con la que se decide si vale la pena gastar en pauta hoy.
   */
  const ltv = {} as Record<Escenario, Metrica>;
  for (const esc of ['pesimista', 'moderado', 'optimista'] as Escenario[]) {
    const c = churnEscenarios[esc];
    ltv[esc] =
      contribucionPostBeta === null
        ? sinDatos('Falta la contribución por usuario.')
        : c <= 0
          ? sinDatos('El churn tiene que ser mayor que cero.')
          : mixto(Math.round(contribucionPostBeta / (c / 100)));
  }

  // ── Salud ───────────────────────────────────────────────────────────────
  const cacParaRatio = cacPorClienteReal.valor ?? cacPorRegistro.valor;

  const ltvSobreCac = {} as Record<Escenario, Metrica>;
  for (const esc of ['pesimista', 'moderado', 'optimista'] as Escenario[]) {
    ltvSobreCac[esc] =
      !cacParaRatio || !ltv[esc].valor
        ? sinDatos('Falta el CAC o el LTV.')
        : mixto(redondear(ltv[esc].valor! / cacParaRatio, 2));
  }

  const payback: Metrica =
    !cacParaRatio
      ? sinDatos('Falta el CAC.')
      : !contribucionPostBeta || contribucionPostBeta <= 0
        ? sinDatos(
            'La contribución por usuario no es positiva, así que lo gastado en adquirirlo no se ' +
              'recupera nunca con este modelo.',
          )
        : mixto(redondear(cacParaRatio / contribucionPostBeta, 1));

  // ── Caja ────────────────────────────────────────────────────────────────
  const quema = entradas.costosFijosMensualesArs;
  const caja = entradas.cajaDisponibleArs;

  const runway: Metrica =
    quema <= 0
      ? sinDatos('No hay costos mensuales cargados en el plan.')
      : caja <= 0
        ? sinDatos('No hay caja disponible cargada en el plan.')
        : supuesto(redondear(caja / quema, 1));

  // ── Retención ───────────────────────────────────────────────────────────
  const coh = await cohortes().catch(() => []);
  const conDatos = coh.filter((c) => c.altas > 0);
  const totalAltas = conDatos.reduce((a, c) => a + c.altas, 0);
  const totalM1 = conDatos.reduce((a, c) => a + c.activosM1, 0);

  let diagnostico: string;
  if (totalAltas === 0) {
    diagnostico =
      'Todavía no hay altas suficientes para armar una cohorte. La retención no se puede medir ' +
      'hasta que pase al menos un mes completo con usuarios reales.';
  } else if (totalM1 === 0) {
    diagnostico =
      `De ${totalAltas} altas del último año, ninguna volvió a contratar al mes siguiente. Con ` +
      'estos volúmenes puede ser simplemente que no haya pasado suficiente tiempo, pero es el ' +
      'número que hay que mirar antes de poner plata en pauta: adquirir usuarios que no vuelven ' +
      'es comprar un balde agujereado.';
  } else {
    const pct = redondear((totalM1 / totalAltas) * 100, 1);
    diagnostico =
      `${pct}% de las altas volvieron a contratar al mes siguiente. En un marketplace de oficios ` +
      'la frecuencia es baja por naturaleza —a un plomero no se lo llama todos los meses— así que ' +
      'este número se lee contra la frecuencia esperada del rubro, no contra el de una app de uso ' +
      'diario.';
  }

  /**
   * El plan tiene dos tickets y pueden no coincidir. Se avisa en vez de
   * elegir uno en silencio: la diferencia entre EUR 22 y USD 85 no es un
   * redondeo, son dos negocios distintos, y cuál es el real lo sabe el owner.
   */
  const inconsistenciaDelPlan =
    entradas.ticketUeArs > 0 &&
    entradas.ticketProyeccionArs > 0 &&
    Math.abs(entradas.ticketUeArs - entradas.ticketProyeccionArs) /
      Math.max(entradas.ticketUeArs, entradas.ticketProyeccionArs) >
      0.25
      ? `El plan tiene dos tickets promedio que no coinciden: ${entradas.ticketUeArs.toLocaleString('es-AR')} ` +
        `en el bloque de unit economics y ${entradas.ticketProyeccionArs.toLocaleString('es-AR')} en la ` +
        'proyección mensual. Acá se usó el primero, porque es el que viene con sus costos variables ' +
        'en la misma moneda. Conviene unificarlos: con esta diferencia, los dos modelos describen ' +
        'negocios distintos.'
      : null;

  // ── Veredicto ───────────────────────────────────────────────────────────
  const REFERENCIA = REFERENCIA_LTV_CAC;
  let veredicto: string;
  const ratioModerado = ltvSobreCac.moderado.valor;

  /**
   * El margen por contrato va PRIMERO cuando es negativo.
   *
   * No depende de que haya usuarios: es aritmética sobre los supuestos del
   * plan, y es válida el día uno. Si atender un contrato cuesta más que la
   * comisión que deja, ninguna cantidad de usuarios arregla el negocio —cada
   * uno nuevo agranda la pérdida— y eso hay que saberlo antes de gastar en
   * pauta, no después.
   *
   * Es el hallazgo más caro de descubrir tarde, así que se dice antes que
   * "todavía no hay datos".
   */
  if (margenPorContrato !== null && margenPorContrato < 0) {
    veredicto =
      `Con los supuestos del plan, cada contrato deja margen NEGATIVO: la comisión del ` +
      `${COMMISSION_RATES.free}% sobre el ticket da ${(desglosePorContrato!.comisionGanada).toLocaleString('es-AR')} ` +
      `y atenderlo cuesta ${desglosePorContrato!.costoVariable.toLocaleString('es-AR')} entre soporte, ` +
      `disputas y fraude. Son ${Math.abs(margenPorContrato).toLocaleString('es-AR')} de pérdida por contrato, ` +
      'y no lo arregla tener más usuarios: cada uno nuevo la agranda. Las tres salidas son subir el ' +
      'ticket mínimo, bajar el costo de atención (automatizar disputas y soporte) o subir la comisión. ' +
      'Conviene resolverlo antes de gastar en adquisición.';
  } else if (enBeta && totalAltas === 0) {
    veredicto =
      'No hay negocio que medir todavía: la beta no arrancó, la comisión es 0% y no hay usuarios. ' +
      'Los números de abajo son el modelo, no una medición. Lo único accionable hoy es fijar de ' +
      'antemano cuánto estás dispuesto a pagar por un cliente, para tener contra qué comparar ' +
      'cuando empiece a haberlos.';
  } else if (ratioModerado === null) {
    veredicto =
      'Falta al menos una de las dos mitades (CAC o LTV) para poder decir si el negocio cierra. ' +
      'Lo que falta está indicado en cada métrica.';
  } else if (ratioModerado >= REFERENCIA) {
    veredicto =
      `Con los supuestos actuales el ratio moderado da ${ratioModerado}×, por encima del ${REFERENCIA}× ` +
      'que se toma como referencia en software. El límite no es la economía unitaria: es cuánta ' +
      'demanda hay al precio actual del canal.';
  } else if (ratioModerado >= 1) {
    veredicto =
      `El ratio moderado da ${ratioModerado}×: cada cliente devuelve más de lo que costó, pero por ` +
      `debajo del ${REFERENCIA}× de referencia. Alcanza para sostener, no para escalar gastando más.`;
  } else {
    veredicto =
      `El ratio moderado da ${ratioModerado}×: se pierde plata con cada cliente adquirido. Escalar ` +
      'la pauta en este estado multiplica la pérdida, no los ingresos.';
  }

  return {
    calculadoEn: new Date().toISOString(),
    moneda: 'ARS',
    eurArs: redondear(eurArs),

    contexto: {
      fase,
      comisionVigentePct,
      comisionPostBetaPct: COMMISSION_RATES.free,
      advertencia: enBeta
        ? `Durante la beta la comisión es 0%. El LTV y el payback de abajo están calculados con la ` +
          `comisión del ${COMMISSION_RATES.free}% que rige al cerrarla: responden "cuánto valdría un ` +
          'cliente cuando empecemos a cobrar", no "cuánto vale hoy", que es cero.'
        : null,
      inconsistenciaDelPlan,
      costoFueraDeRango: desglosePorContrato
        ? discrepanciaDeCosto(desglosePorContrato.costoVariable)
        : null,
    },

    adquisicion: {
      gastoMarketingMensual: gastoM,
      altas30: altas30 > 0 ? medido(altas30) : sinDatos('No hubo altas en los últimos 30 días.'),
      altasQueTransaccionaron30:
        transaccionaron > 0
          ? medido(transaccionaron)
          : sinDatos('Ninguna alta reciente contrató todavía.'),
      cacPorRegistro,
      cacPorClienteReal,
    },

    valor: {
      ticketPromedio: ticket,
      contratosPorUsuarioMes: contratosPorUsuario,
      contribucionMensual: contribucion,
      desglosePorContrato,
      churnMensualPct: churn,
      ltv,
      churnPorEscenario: churnEscenarios,
    },

    salud: {
      ltvSobreCac,
      paybackMeses: payback,
      referenciaLtvCac: REFERENCIA,
      veredicto,
    },

    caja: {
      disponible: caja > 0 ? supuesto(caja) : sinDatos('No hay caja cargada en el plan.'),
      quemaMensual: quema > 0 ? supuesto(quema) : sinDatos('No hay costos mensuales en el plan.'),
      runwayMeses: runway,
    },

    retencion: { cohortes: coh, diagnostico },
  };
}
