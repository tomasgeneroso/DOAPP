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
 */

export interface GrowthAssumptions {
  /** Usuarios activos al arrancar la proyección */
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
  /** Meses a proyectar */
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

export interface ProjectionAssumptions {
  growth: GrowthAssumptions;
  revenue: RevenueAssumptions;
  costs: CostAssumptions;
  taxes: TaxAssumptions;
  /** Caja al arrancar (capital restante tras la constitución) */
  cajaInicial: number;
}

export interface MonthRow {
  mes: number;
  etiqueta: string;
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

  const meses: MonthRow[] = [];

  let usuarios = Math.max(0, num(growth.usuariosIniciales));
  let caja = num(a.cajaInicial);
  let fijos = Math.max(0, num(costs.fijosMensuales));
  // Saldo de IVA a favor y quebrantos se arrastran de un mes al siguiente
  let saldoIvaAFavor = 0;
  let quebrantoAcumulado = 0;

  let ingresoAcumulado = 0;
  let costoAcumulado = 0;
  let impuestosAcumulados = 0;
  let resultadoAcumulado = 0;

  let pisoCaja = caja;
  let mesPisoCaja: number | null = null;
  let mesEbitdaPositivo: number | null = null;
  let mesResultadoPositivo: number | null = null;
  let mesPaybackCaja: number | null = null;
  let mesSinCaja: number | null = null;

  for (let i = 0; i < horizonte; i++) {
    const base = usuarios;

    // --- usuarios -------------------------------------------------------
    let altas =
      growth.modoCrecimiento === 'absoluto'
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
    const ingresoComision = gmv * pct(revenue.comisionPct);
    const ingresoMembresias =
      usuariosPromedio * pct(revenue.membresiaPct) * num(revenue.membresiaPrecio);
    const ingresoPublicidad = num(revenue.publicidadMensual);
    const ingresoBruto = ingresoComision + ingresoMembresias + ingresoPublicidad;

    // Si la comisión se cobra con IVA incluido, la parte gravada no es ingreso
    const ingresoNeto = revenue.ingresosConIva
      ? ingresoBruto / (1 + pct(taxes.ivaPct))
      : ingresoBruto;

    // --- costos ---------------------------------------------------------
    const costoSoporte = usuariosPromedio * num(costs.soportePorUsuario);
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

    // --- acumulados y marcas -------------------------------------------
    ingresoAcumulado += ingresoNeto;
    costoAcumulado += costosTotales;
    impuestosAcumulados += impuestosTotales;
    resultadoAcumulado += resultadoNeto;

    const mes = i + 1;
    if (mesEbitdaPositivo === null && ebitda > 0) mesEbitdaPositivo = mes;
    if (mesResultadoPositivo === null && resultadoNeto > 0) mesResultadoPositivo = mes;
    if (caja < pisoCaja) { pisoCaja = caja; mesPisoCaja = mes; }
    if (mesSinCaja === null && caja < 0) mesSinCaja = mes;
    if (mesPaybackCaja === null && caja > 0 && mesSinCaja !== null) mesPaybackCaja = mes;

    meses.push({
      mes,
      etiqueta: monthLabel(growth.mesInicio, i),
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

    // Los costos fijos crecen con el equipo
    fijos = fijos * (1 + pct(costs.fijosCrecimientoPct));
  }

  // --- unit economics ---------------------------------------------------
  // Se miden sobre el último mes proyectado, que refleja la escala de régimen
  const ultimo = meses[meses.length - 1];
  const usuariosUlt = ultimo.usuarios || 1;
  const ingresoPorUsuario = ultimo.ingresoNeto / usuariosUlt;
  const costoVariablePorUsuario = ultimo.costosVariables / usuariosUlt;
  const margenContribucionUsuario = ingresoPorUsuario - costoVariablePorUsuario;

  const churnMensual = pct(growth.churnPct);
  // Sin churn la vida del usuario sería infinita: se acota a 60 meses
  const vidaMeses = churnMensual > 0 ? 1 / churnMensual : 60;
  const ltv = margenContribucionUsuario * Math.min(vidaMeses, 60);
  const cac = num(costs.cac);

  return {
    meses,
    resumen: {
      mesEbitdaPositivo,
      mesResultadoPositivo,
      mesPaybackCaja,
      mesSinCaja,
      pisoCaja,
      mesPisoCaja,
      cajaFinal: caja,
      usuariosFinales: ultimo.usuarios,
      ingresoAcumulado,
      costoAcumulado,
      impuestosAcumulados,
      resultadoAcumulado,
      ltv,
      cac,
      ltvCac: cac > 0 ? ltv / cac : null,
      mesesRecuperoCac:
        margenContribucionUsuario > 0 ? cac / margenContribucionUsuario : null,
      margenContribucionUsuario,
    },
  };
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
  };
}
