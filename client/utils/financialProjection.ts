/**
 * Motor de proyección financiera.
 *
 * Toma supuestos de crecimiento, monetización, costos e impuestos y devuelve
 * el mes a mes de la operación: usuarios, ingresos, costos, impuestos,
 * resultado y caja acumulada. Es una función pura — la pantalla sólo dibuja
 * lo que sale de acá.
 *
 * Los impuestos están modelados para una SAS argentina inscripta en IVA:
 * IVA con arrastre de saldo a favor, Ingresos Brutos, impuesto a los débitos
 * y créditos bancarios, y Ganancias con compensación de quebrantos.
 *
 * ── Dos etapas ──────────────────────────────────────────────────────────────
 *
 * El negocio no arranca cobrando: primero hay una BETA (comisión 0%, pocos
 * usuarios, soporte a mano) y recién después la etapa REAL. Un modelo que
 * supone la comisión completa desde el mes uno proyecta ingresos que no van a
 * existir y esconde cuánta caja se come la beta. `beta` es opcional: sin él, el
 * motor se comporta exactamente como antes.
 */

export interface GrowthAssumptions {
  /**
   * Usuarios REGISTRADOS al arrancar la proyección. La base que proyecta el motor son
   * los registrados (los que se dieron de alta y no se fueron), no los activos del
   * mes: ver `activosPct`.
   */
  usuariosIniciales: number;
  /** 'porcentaje' crece sobre la base; 'absoluto' suma altas fijas por mes */
  modoCrecimiento: 'porcentaje' | 'absoluto';
  /** Altas mensuales como % de la base (modo porcentaje) */
  crecimientoPct: number;
  /** Altas mensuales fijas (modo absoluto) */
  altasPorMes: number;
  /** Bajas mensuales como % de la base */
  churnPct: number;
  /** Techo de mercado alcanzable: frena el crecimiento al acercarse. 0 = sin techo */
  techoUsuarios: number;
  /**
   * De cada 100 usuarios registrados, cuántos son activos en un mes. NO lo usa el
   * motor: lo usa `coordinarPlan` para pasar los contratos y el soporte por usuario
   * ACTIVO de la economía unitaria a los de usuario REGISTRADO que consume el motor.
   */
  activosPct?: number;
  /** Meses a proyectar (el plan corre 120 y la pantalla muestra 12, 36, 60 o 120) */
  horizonteMeses: number;
  /** Mes de inicio en formato YYYY-MM */
  mesInicio: string;
}

export interface RevenueAssumptions {
  /** Valor promedio de un contrato */
  ticket: number;
  /** Contratos que cierra un usuario activo por mes */
  contratosPorUsuario: number;
  /** Comisión de la plataforma sobre el contrato (%) */
  comisionPct: number;
  /** Usuarios con membresía paga (%) */
  membresiaPct: number;
  /** Precio mensual de la membresía */
  membresiaPrecio: number;
  /** Ingreso mensual por publicidad */
  publicidadMensual: number;
  /** Los ingresos declarados ya incluyen IVA */
  ingresosConIva: boolean;
}

export interface CostAssumptions {
  /** Costo de soporte por usuario activo / mes */
  soportePorUsuario: number;
  /** Costo de infraestructura por usuario activo / mes */
  infraPorUsuario: number;
  /** Comisión del medio de pago sobre el volumen transaccionado (%) */
  pspPct: number;
  /** Costo de disputas como % del volumen */
  disputasPct: number;
  /** Fraude y contracargos como % del volumen */
  fraudePct: number;
  /** Costo de adquirir un usuario nuevo */
  cac: number;
  /** Costos fijos del primer mes (equipo, oficina, servicios) */
  fijosMensuales: number;
  /** Cuánto crecen los costos fijos por mes (%), por contrataciones */
  fijosCrecimientoPct: number;
  /** Porción de los costos que tiene IVA computable (%) */
  costosConIvaPct: number;
}

export interface TaxAssumptions {
  ivaPct: number;
  /** Ingresos Brutos sobre la facturación neta (%) */
  iibbPct: number;
  /** Débitos y créditos bancarios, por cada movimiento (%) */
  chequePct: number;
  /** Impuesto a las ganancias sobre la utilidad (%) */
  gananciasPct: number;
}

/**
 * La etapa de beta: lo que cambia mientras dura y se reemplaza por la etapa real.
 *
 * Los supuestos por usuario (ticket, contratos, disputas, fraude) son los mismos
 * en las dos etapas porque describen el negocio, no el momento. Lo que cambia es
 * cuánto se cobra, cuánta gente entra y cuánto cuesta sostener la operación.
 */
export interface EtapaBeta {
  /** Meses que dura, contados desde el mes 1. 0 = no hay beta. */
  meses: number;
  /** Comisión mientras dura (%). Hoy es 0: no se cobra durante la beta. */
  comisionPct: number;
  /** Usuarios nuevos por mes durante la beta. */
  altasPorMes: number;
  /** Costos fijos mensuales de la beta. */
  fijosMensuales: number;
  /**
   * Soporte por usuario durante la beta. Normalmente 0: con pocos usuarios el
   * soporte se hace a mano y ya está en `fijosMensuales`; contarlo también por
   * usuario sería contarlo dos veces.
   */
  soportePorUsuario: number;
}

export interface ProjectionAssumptions {
  growth: GrowthAssumptions;
  revenue: RevenueAssumptions;
  costs: CostAssumptions;
  taxes: TaxAssumptions;
  /** Caja al arrancar (capital restante tras la constitución) */
  cajaInicial: number;
  /** La beta que precede a la etapa real. Opcional. */
  beta?: EtapaBeta;
}

export type Etapa = 'beta' | 'real';

export interface MonthRow {
  mes: number;
  etiqueta: string;
  /** En qué etapa cae el mes */
  etapa: Etapa;
  usuarios: number;
  altas: number;
  bajas: number;
  contratos: number;
  /** Volumen transaccionado por los usuarios */
  gmv: number;
  ingresoBruto: number;
  ingresoNeto: number;
  ingresoComision: number;
  ingresoMembresias: number;
  ingresoPublicidad: number;
  costosVariables: number;
  costoAdquisicion: number;
  costosFijos: number;
  costosTotales: number;
  ebitda: number;
  iva: number;
  iibb: number;
  cheque: number;
  ganancias: number;
  impuestosTotales: number;
  resultadoNeto: number;
  flujoCaja: number;
  cajaAcumulada: number;
}

export interface ProjectionSummary {
  /** Primer mes con EBITDA positivo (1-based); null si nunca */
  mesEbitdaPositivo: number | null;
  /** Primer mes con resultado neto positivo */
  mesResultadoPositivo: number | null;
  /** Mes en que la caja acumulada vuelve a ser positiva */
  mesPaybackCaja: number | null;
  /** Mes en que la caja se agota, si pasa */
  mesSinCaja: number | null;
  /** Punto más bajo de la caja: cuánto capital hace falta como mínimo */
  pisoCaja: number;
  mesPisoCaja: number | null;
  cajaFinal: number;
  usuariosFinales: number;
  ingresoAcumulado: number;
  costoAcumulado: number;
  impuestosAcumulados: number;
  resultadoAcumulado: number;
  /** Valor de vida del usuario, con el margen de contribución y el churn */
  ltv: number;
  cac: number;
  ltvCac: number | null;
  /** Meses que tarda un usuario en repagar su costo de adquisición */
  mesesRecuperoCac: number | null;
  margenContribucionUsuario: number;
  /** Cuántos meses de beta entran en lo proyectado (0 si no hay) */
  mesesDeBeta: number;
  /** La caja en el último mes de la beta; null si no hay beta */
  cajaAlTerminarLaBeta: number | null;
}

export interface Projection {
  meses: MonthRow[];
  resumen: ProjectionSummary;
}

const MESES_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** Etiqueta "ago-2026" a partir del mes de inicio y un desplazamiento */
export function monthLabel(mesInicio: string, offset: number): string {
  const match = /^(\d{4})-(\d{1,2})$/.exec(mesInicio || '');
  const year = match ? Number(match[1]) : new Date().getFullYear();
  const month = match ? Number(match[2]) - 1 : new Date().getMonth();
  const total = month + offset;
  return `${MESES_ES[((total % 12) + 12) % 12]}-${year + Math.floor(total / 12)}`;
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (v: any) => num(v) / 100;

/**
 * Corre la proyección mes a mes.
 *
 * El orden importa: primero la base de usuarios, después los ingresos que
 * genera, después lo que cuesta sostenerla, y recién al final los impuestos,
 * que dependen de todo lo anterior.
 */
export function projectFinancials(a: ProjectionAssumptions): Projection {
  const { growth, revenue, costs, taxes } = a;
  const horizonte = Math.max(1, Math.min(120, Math.round(num(growth.horizonteMeses) || 24)));

  // La beta, si hay. Nunca más larga que lo que se proyecta.
  const beta = a.beta && num(a.beta.meses) > 0 ? a.beta : null;
  const mesesBeta = beta ? Math.min(horizonte, Math.max(0, Math.round(num(beta.meses)))) : 0;

  const meses: MonthRow[] = [];

  let usuarios = Math.max(0, num(growth.usuariosIniciales));
  let caja = num(a.cajaInicial);
  // Con beta, el mes 1 arranca con los fijos de la beta; los de la etapa real
  // empiezan recién cuando termina.
  let fijos = beta ? Math.max(0, num(beta.fijosMensuales)) : Math.max(0, num(costs.fijosMensuales));
  // Saldo de IVA a favor y quebrantos se arrastran de un mes al siguiente
  let saldoIvaAFavor = 0;
  let quebrantoAcumulado = 0;

  for (let i = 0; i < horizonte; i++) {
    const enBeta = i < mesesBeta;
    // Termina la beta: empiezan los costos fijos de la etapa real
    if (beta && i === mesesBeta) fijos = Math.max(0, num(costs.fijosMensuales));

    const base = usuarios;

    // --- usuarios -------------------------------------------------------
    let altas = enBeta
      ? Math.max(0, num(beta!.altasPorMes))
      : growth.modoCrecimiento === 'absoluto'
        ? Math.max(0, num(growth.altasPorMes))
        : base * pct(growth.crecimientoPct);

    // El techo de mercado frena las altas a medida que se satura: sin esto
    // cualquier crecimiento porcentual proyecta una exponencial irreal.
    const techo = Math.max(0, num(growth.techoUsuarios));
    if (techo > 0) {
      const espacio = Math.max(0, 1 - base / techo);
      altas = altas * espacio;
    }

    const bajas = base * pct(growth.churnPct);
    usuarios = Math.max(0, base + altas - bajas);

    // Los ingresos del mes los genera el promedio de la base, no el cierre
    const usuariosPromedio = (base + usuarios) / 2;

    // --- ingresos -------------------------------------------------------
    const contratos = usuariosPromedio * num(revenue.contratosPorUsuario);
    const gmv = contratos * num(revenue.ticket);
    const comisionPct = enBeta ? num(beta!.comisionPct) : num(revenue.comisionPct);
    const ingresoComision = gmv * pct(comisionPct);
    const ingresoMembresias =
      usuariosPromedio * pct(revenue.membresiaPct) * num(revenue.membresiaPrecio);
    const ingresoPublicidad = num(revenue.publicidadMensual);
    const ingresoBruto = ingresoComision + ingresoMembresias + ingresoPublicidad;

    // Si la comisión se cobra con IVA incluido, la parte gravada no es ingreso
    const ingresoNeto = revenue.ingresosConIva
      ? ingresoBruto / (1 + pct(taxes.ivaPct))
      : ingresoBruto;

    // --- costos ---------------------------------------------------------
    const soportePorUsuario = enBeta ? num(beta!.soportePorUsuario) : num(costs.soportePorUsuario);
    const costoSoporte = usuariosPromedio * soportePorUsuario;
    const costoInfra = usuariosPromedio * num(costs.infraPorUsuario);
    const costoPsp = gmv * pct(costs.pspPct);
    const costoDisputas = gmv * pct(costs.disputasPct);
    const costoFraude = gmv * pct(costs.fraudePct);
    const costosVariables = costoSoporte + costoInfra + costoPsp + costoDisputas + costoFraude;

    const costoAdquisicion = altas * num(costs.cac);
    const costosFijos = fijos;
    const costosTotales = costosVariables + costoAdquisicion + costosFijos;

    const ebitda = ingresoNeto - costosTotales;

    // --- impuestos ------------------------------------------------------
    // IVA: débito por lo facturado, crédito por los gastos gravados. El saldo
    // a favor no se pierde, se arrastra al mes siguiente.
    const ivaDebito = ingresoNeto * pct(taxes.ivaPct);
    const gastosGravados = costosTotales * pct(costs.costosConIvaPct);
    const ivaCredito = gastosGravados * (pct(taxes.ivaPct) / (1 + pct(taxes.ivaPct)));
    const ivaBruto = ivaDebito - ivaCredito - saldoIvaAFavor;
    const iva = Math.max(0, ivaBruto);
    saldoIvaAFavor = Math.max(0, -ivaBruto);

    const iibb = ingresoNeto * pct(taxes.iibbPct);

    // Débitos y créditos: se paga sobre el dinero que entra y el que sale
    const cheque = (ingresoBruto + costosTotales) * pct(taxes.chequePct);

    // Ganancias: sobre la utilidad después de IIBB y del impuesto al cheque,
    // compensando las pérdidas acumuladas de los meses anteriores.
    const utilidadAntesImpuestos = ebitda - iibb - cheque;
    let ganancias = 0;
    if (utilidadAntesImpuestos > 0) {
      const compensado = Math.min(quebrantoAcumulado, utilidadAntesImpuestos);
      quebrantoAcumulado -= compensado;
      ganancias = (utilidadAntesImpuestos - compensado) * pct(taxes.gananciasPct);
    } else {
      quebrantoAcumulado += -utilidadAntesImpuestos;
    }

    const impuestosTotales = iva + iibb + cheque + ganancias;
    const resultadoNeto = utilidadAntesImpuestos - ganancias;

    // El IVA se cobra y se paga, así que la caja se mueve con los brutos
    const flujoCaja = ingresoBruto - costosTotales - iva - iibb - cheque - ganancias;
    caja += flujoCaja;

    meses.push({
      mes: i + 1,
      etiqueta: monthLabel(growth.mesInicio, i),
      etapa: enBeta ? 'beta' : 'real',
      usuarios: Math.round(usuarios),
      altas: Math.round(altas),
      bajas: Math.round(bajas),
      contratos: Math.round(contratos),
      gmv,
      ingresoBruto,
      ingresoNeto,
      ingresoComision,
      ingresoMembresias,
      ingresoPublicidad,
      costosVariables,
      costoAdquisicion,
      costosFijos,
      costosTotales,
      ebitda,
      iva,
      iibb,
      cheque,
      ganancias,
      impuestosTotales,
      resultadoNeto,
      flujoCaja,
      cajaAcumulada: caja,
    });

    // Los costos fijos crecen con el equipo, pero recién cuando la operación es
    // real: durante la beta no se contrata.
    if (!enBeta) fijos = fijos * (1 + pct(costs.fijosCrecimientoPct));
  }

  return { meses, resumen: resumirProyeccion(meses, a) };
}

/**
 * El resumen de una proyección, o de un tramo de ella.
 *
 * Está aparte del bucle para poder calcularlo sobre los primeros 12, 36, 60 o
 * 120 meses de UNA misma corrida. Correr el motor una vez por horizonte daría lo
 * mismo, pero cuatro veces el trabajo y, sobre todo, la posibilidad de que dos
 * corridas con supuestos que se tocaron entre medio no coincidan.
 */
export function resumirProyeccion(meses: MonthRow[], a: ProjectionAssumptions): ProjectionSummary {
  const { growth, costs } = a;

  let pisoCaja = num(a.cajaInicial);
  let mesPisoCaja: number | null = null;
  let mesEbitdaPositivo: number | null = null;
  let mesResultadoPositivo: number | null = null;
  let mesPaybackCaja: number | null = null;
  let mesSinCaja: number | null = null;

  let ingresoAcumulado = 0;
  let costoAcumulado = 0;
  let impuestosAcumulados = 0;
  let resultadoAcumulado = 0;

  for (const m of meses) {
    ingresoAcumulado += m.ingresoNeto;
    costoAcumulado += m.costosTotales;
    impuestosAcumulados += m.impuestosTotales;
    resultadoAcumulado += m.resultadoNeto;

    if (mesEbitdaPositivo === null && m.ebitda > 0) mesEbitdaPositivo = m.mes;
    if (mesResultadoPositivo === null && m.resultadoNeto > 0) mesResultadoPositivo = m.mes;
    if (m.cajaAcumulada < pisoCaja) { pisoCaja = m.cajaAcumulada; mesPisoCaja = m.mes; }
    if (mesSinCaja === null && m.cajaAcumulada < 0) mesSinCaja = m.mes;
    if (mesPaybackCaja === null && m.cajaAcumulada > 0 && mesSinCaja !== null) mesPaybackCaja = m.mes;
  }

  const ultimo = meses[meses.length - 1];

  // --- unit economics ---------------------------------------------------
  // Se miden sobre el último mes del tramo, que refleja la escala de régimen. La
  // beta va siempre antes que la etapa real, así que el último mes es de la etapa
  // real salvo que el tramo termine adentro de la beta: ahí no se cobra comisión y
  // el margen sale negativo, que es lo que pasa en ese tramo.
  const referencia = ultimo;
  const usuariosRef = referencia?.usuarios || 1;
  const ingresoPorUsuario = referencia ? referencia.ingresoNeto / usuariosRef : 0;
  const costoVariablePorUsuario = referencia ? referencia.costosVariables / usuariosRef : 0;
  const margenContribucionUsuario = ingresoPorUsuario - costoVariablePorUsuario;

  const churnMensual = pct(growth.churnPct);
  // Sin churn la vida del usuario sería infinita: se acota a 60 meses
  const vidaMeses = churnMensual > 0 ? 1 / churnMensual : 60;
  const ltv = margenContribucionUsuario * Math.min(vidaMeses, 60);
  const cac = num(costs.cac);

  const deBeta = meses.filter((m) => m.etapa === 'beta');

  return {
    mesEbitdaPositivo,
    mesResultadoPositivo,
    mesPaybackCaja,
    mesSinCaja,
    pisoCaja,
    mesPisoCaja,
    cajaFinal: ultimo ? ultimo.cajaAcumulada : num(a.cajaInicial),
    usuariosFinales: ultimo ? ultimo.usuarios : 0,
    ingresoAcumulado,
    costoAcumulado,
    impuestosAcumulados,
    resultadoAcumulado,
    ltv,
    cac,
    ltvCac: cac > 0 ? ltv / cac : null,
    mesesRecuperoCac: margenContribucionUsuario > 0 ? cac / margenContribucionUsuario : null,
    margenContribucionUsuario,
    mesesDeBeta: deBeta.length,
    cajaAlTerminarLaBeta: deBeta.length ? deBeta[deBeta.length - 1].cajaAcumulada : null,
  };
}

/* ------------------------------------------------------------------ *
 * Horizontes: 1, 3, 5 y 10 años
 * ------------------------------------------------------------------ */

export const HORIZONTES = [
  { anios: 1, meses: 12, rotulo: '1 año' },
  { anios: 3, meses: 36, rotulo: '3 años' },
  { anios: 5, meses: 60, rotulo: '5 años' },
  { anios: 10, meses: 120, rotulo: '10 años' },
] as const;

export type AniosDeHorizonte = (typeof HORIZONTES)[number]['anios'];

/** Los primeros `meses` de una proyección, con su resumen recalculado. */
export function proyeccionHastaMes(
  p: Projection,
  a: ProjectionAssumptions,
  meses: number,
): Projection {
  const tramo = p.meses.slice(0, Math.max(1, Math.min(meses, p.meses.length)));
  return { meses: tramo, resumen: resumirProyeccion(tramo, a) };
}

export interface ResumenDeHorizonte {
  anios: AniosDeHorizonte;
  meses: number;
  rotulo: string;
  usuarios: number;
  /** Lo que se facturó en los últimos 12 meses del horizonte (neto de IVA) */
  ingresosDelUltimoAnio: number;
  /** El EBITDA de los últimos 12 meses del horizonte */
  ebitdaDelUltimoAnio: number;
  resultadoAcumulado: number;
  cajaAcumulada: number;
  /** Cuánto capital hace falta como mínimo para no quedarse sin caja */
  capitalMinimo: number;
  mesEbitdaPositivo: number | null;
  mesSinCaja: number | null;
}

/**
 * Qué pasa a 1, 3, 5 y 10 años, de UNA corrida de 120 meses.
 *
 * "Ingresos del último año" y no "ingresos del mes": un mes suelto no dice si el
 * negocio se sostiene, y el acumulado desde el principio mezcla la beta con el
 * régimen. Los últimos doce meses de cada horizonte son lo que ese año mueve.
 */
export function resumenPorHorizonte(p: Projection, a: ProjectionAssumptions): ResumenDeHorizonte[] {
  return HORIZONTES.map(({ anios, meses, rotulo }) => {
    const tramo = p.meses.slice(0, Math.min(meses, p.meses.length));
    const ultimoAnio = tramo.slice(-12);
    const r = resumirProyeccion(tramo, a);
    const suma = (f: (m: MonthRow) => number) => ultimoAnio.reduce((s, m) => s + f(m), 0);

    return {
      anios,
      meses,
      rotulo,
      usuarios: r.usuariosFinales,
      ingresosDelUltimoAnio: suma((m) => m.ingresoNeto),
      ebitdaDelUltimoAnio: suma((m) => m.ebitda),
      resultadoAcumulado: r.resultadoAcumulado,
      cajaAcumulada: r.cajaFinal,
      capitalMinimo: r.pisoCaja < 0 ? Math.abs(r.pisoCaja) : 0,
      mesEbitdaPositivo: r.mesEbitdaPositivo,
      mesSinCaja: r.mesSinCaja,
    };
  });
}

/** Escenarios: mueven crecimiento, ticket y CAC alrededor del caso base */
export type ScenarioKey = 'conservador' | 'base' | 'optimista';

export const SCENARIOS: Record<ScenarioKey, { label: string; growth: number; ticket: number; cac: number; churn: number }> = {
  conservador: { label: 'Conservador', growth: 0.5, ticket: 0.85, cac: 1.3, churn: 1.4 },
  base: { label: 'Base', growth: 1, ticket: 1, cac: 1, churn: 1 },
  optimista: { label: 'Optimista', growth: 1.5, ticket: 1.15, cac: 0.8, churn: 0.7 },
};

export function applyScenario(
  a: ProjectionAssumptions,
  key: ScenarioKey
): ProjectionAssumptions {
  const s = SCENARIOS[key];
  return {
    ...a,
    growth: {
      ...a.growth,
      crecimientoPct: a.growth.crecimientoPct * s.growth,
      altasPorMes: a.growth.altasPorMes * s.growth,
      churnPct: a.growth.churnPct * s.churn,
    },
    revenue: { ...a.revenue, ticket: a.revenue.ticket * s.ticket },
    costs: { ...a.costs, cac: a.costs.cac * s.cac },
    // El escenario también mueve cuánta gente entra durante la beta
    beta: a.beta ? { ...a.beta, altasPorMes: a.beta.altasPorMes * s.growth } : undefined,
  };
}
