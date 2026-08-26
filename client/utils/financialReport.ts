/**
 * Informe escrito de la proyección financiera.
 *
 * Traduce los números del motor a las tres preguntas que importan: si el
 * negocio cierra, cuándo, y cuánto capital hace falta hasta entonces.
 * Devuelve secciones para mostrar en pantalla y el mismo texto en Markdown
 * para descargar.
 */

import type { Projection, ProjectionAssumptions } from './financialProjection';

export interface ReportSection {
  titulo: string;
  parrafos: string[];
}

export type Verdict = 'viable' | 'ajustado' | 'no-cierra';

export interface FinancialReport {
  veredicto: Verdict;
  titular: string;
  resumen: string;
  secciones: ReportSection[];
  alertas: string[];
  markdown: string;
}

interface ReportOptions {
  /** Formateador de moneda de la pantalla, para que el texto use la misma */
  fmt: (n: number) => string;
  /** Nombre del mes calendario de un mes de la proyección */
  etiquetaMes: (mes: number) => string;
  /** Formateador para montos chicos por usuario, donde los centavos importan */
  fmtUnit?: (n: number) => string;
}

const pctStr = (n: number) => `${n.toFixed(1)}%`;
const n0 = (n: number) => Math.round(n).toLocaleString('es-AR');

export function buildReport(
  projection: Projection,
  a: ProjectionAssumptions,
  { fmt, etiquetaMes, fmtUnit }: ReportOptions
): FinancialReport {
  const fmtU = fmtUnit || fmt;
  const { meses, resumen: r } = projection;
  const horizonte = meses.length;
  const ultimo = meses[meses.length - 1];
  const alertas: string[] = [];

  const capitalNecesario = r.pisoCaja < 0 ? Math.abs(r.pisoCaja) : 0;
  const llegaAEbitda = r.mesEbitdaPositivo !== null;
  const seQuedaSinCaja = r.mesSinCaja !== null;

  // --- veredicto --------------------------------------------------------
  let veredicto: Verdict;
  let titular: string;

  if (!llegaAEbitda) {
    veredicto = 'no-cierra';
    titular = `Con estos supuestos el negocio no llega a cubrir sus costos en ${horizonte} meses.`;
  } else if (seQuedaSinCaja && r.mesPaybackCaja === null) {
    veredicto = 'no-cierra';
    titular = `La operación se vuelve rentable en el mes ${r.mesEbitdaPositivo}, pero la caja se agota antes (mes ${r.mesSinCaja}) y no se recupera dentro del horizonte.`;
  } else if (seQuedaSinCaja) {
    veredicto = 'ajustado';
    titular = `El negocio cierra, pero pasa por un pozo: la caja queda en rojo desde el mes ${r.mesSinCaja} y recién se recupera en el mes ${r.mesPaybackCaja}.`;
  } else if (r.mesEbitdaPositivo! > horizonte * 0.75) {
    veredicto = 'ajustado';
    titular = `El negocio recién cubre sus costos en el mes ${r.mesEbitdaPositivo} (${etiquetaMes(r.mesEbitdaPositivo!)}), casi al final del horizonte proyectado.`;
  } else {
    veredicto = 'viable';
    titular = `El negocio cubre sus costos en el mes ${r.mesEbitdaPositivo} (${etiquetaMes(r.mesEbitdaPositivo!)}) y cierra el horizonte con ${fmt(r.cajaFinal)} en caja.`;
  }

  const resumen = [
    `Proyección a ${horizonte} meses desde ${etiquetaMes(1)}.`,
    `Se parte de ${n0(a.growth.usuariosIniciales)} usuarios activos y se llega a ${n0(r.usuariosFinales)}.`,
    llegaAEbitda
      ? `El resultado operativo se da vuelta en el mes ${r.mesEbitdaPositivo} y el resultado neto en el mes ${r.mesResultadoPositivo ?? '—'}.`
      : `El resultado operativo sigue negativo al final del horizonte (${fmt(ultimo.ebitda)} en el último mes).`,
    capitalNecesario > 0
      ? `Hace falta cubrir un pozo máximo de ${fmt(capitalNecesario)} alrededor del mes ${r.mesPisoCaja}.`
      : `La caja nunca se pone en rojo: el piso es ${fmt(r.pisoCaja)}.`,
  ].join(' ');

  // --- secciones --------------------------------------------------------
  const secciones: ReportSection[] = [];

  // Crecimiento
  const crecimientoTexto =
    a.growth.modoCrecimiento === 'porcentaje'
      ? `altas del ${pctStr(a.growth.crecimientoPct)} mensual sobre la base`
      : `${n0(a.growth.altasPorMes)} altas nuevas por mes`;
  const vidaMeses = a.growth.churnPct > 0 ? 100 / a.growth.churnPct : Infinity;

  secciones.push({
    titulo: 'Crecimiento de la base',
    parrafos: [
      `El modelo asume ${crecimientoTexto} y un churn del ${pctStr(a.growth.churnPct)}, es decir una permanencia promedio de ${Number.isFinite(vidaMeses) ? `${vidaMeses.toFixed(1)} meses` : 'indefinida'} por usuario.`,
      a.growth.techoUsuarios > 0
        ? `El techo de mercado está fijado en ${n0(a.growth.techoUsuarios)} usuarios; al mes ${horizonte} la base llega a ${n0(r.usuariosFinales)}, un ${pctStr((r.usuariosFinales / a.growth.techoUsuarios) * 100)} de ese techo.`
        : `No hay techo de mercado configurado, así que el crecimiento se proyecta sin saturación. Conviene fijar uno: sin él la curva se vuelve optimista rápido.`,
      `En el último mes se procesan ${n0(ultimo.contratos)} contratos por un volumen de ${fmt(ultimo.gmv)}.`,
    ],
  });

  // Rentabilidad
  const ingresoMesFinal = ultimo.ingresoNeto;
  secciones.push({
    titulo: 'Rentabilidad: cuándo y cuánto',
    parrafos: [
      llegaAEbitda
        ? `El primer mes con resultado operativo positivo es el ${r.mesEbitdaPositivo} (${etiquetaMes(r.mesEbitdaPositivo!)}), cuando los ingresos alcanzan para cubrir costos variables, adquisición y estructura.`
        : `En ningún mes del horizonte los ingresos cubren los costos. En el último mes falta ${fmt(Math.abs(ultimo.ebitda))} para llegar a cero.`,
      r.mesResultadoPositivo
        ? `El resultado neto —ya con impuestos— se da vuelta en el mes ${r.mesResultadoPositivo} (${etiquetaMes(r.mesResultadoPositivo)}).`
        : `El resultado neto no llega a ser positivo dentro del horizonte.`,
      `Al mes ${horizonte} la operación factura ${fmt(ingresoMesFinal)} netos por mes contra ${fmt(ultimo.costosTotales)} de costos, con un resultado neto mensual de ${fmt(ultimo.resultadoNeto)}.`,
      `Acumulado del período: ${fmt(r.ingresoAcumulado)} de ingresos, ${fmt(r.costoAcumulado)} de costos y ${fmt(r.impuestosAcumulados)} de impuestos, con un resultado de ${fmt(r.resultadoAcumulado)}.`,
    ],
  });

  // Capital
  secciones.push({
    titulo: 'Necesidad de capital',
    parrafos: [
      capitalNecesario > 0
        ? `El punto más bajo de la caja es ${fmt(r.pisoCaja)} en el mes ${r.mesPisoCaja} (${etiquetaMes(r.mesPisoCaja!)}). Ése es el capital que hay que tener asegurado antes de arrancar, además de lo que cuesta constituir la sociedad.`
        : `La caja nunca baja de cero: el piso es ${fmt(r.pisoCaja)} en el mes ${r.mesPisoCaja ?? 1}. El capital inicial alcanza para todo el horizonte.`,
      seQuedaSinCaja
        ? `Con el capital cargado (${fmt(a.cajaInicial)}), la caja entra en rojo en el mes ${r.mesSinCaja} (${etiquetaMes(r.mesSinCaja!)}). ${r.mesPaybackCaja ? `Se recupera en el mes ${r.mesPaybackCaja}.` : 'No se recupera dentro del horizonte.'}`
        : `Con el capital cargado (${fmt(a.cajaInicial)}) la operación se sostiene sin financiamiento adicional.`,
      `Al cierre del horizonte quedan ${fmt(r.cajaFinal)} en caja.`,
    ],
  });

  // Impuestos
  const pesoImpuestos =
    r.ingresoAcumulado > 0 ? (r.impuestosAcumulados / r.ingresoAcumulado) * 100 : 0;
  const primerPagoGanancias = meses.find(m => m.ganancias > 0);
  secciones.push({
    titulo: 'Carga impositiva',
    parrafos: [
      `En ${horizonte} meses se pagan ${fmt(r.impuestosAcumulados)} de impuestos, un ${pctStr(pesoImpuestos)} de los ingresos netos del período.`,
      `El desglose del último mes es ${fmt(ultimo.iva)} de IVA, ${fmt(ultimo.iibb)} de Ingresos Brutos (${pctStr(a.taxes.iibbPct)}), ${fmt(ultimo.cheque)} de débitos y créditos bancarios y ${fmt(ultimo.ganancias)} de Ganancias.`,
      primerPagoGanancias
        ? `Ganancias recién se paga a partir del mes ${primerPagoGanancias.mes}: hasta ahí los quebrantos acumulados de los meses en pérdida compensan la utilidad.`
        : `No se paga Ganancias en el horizonte: los quebrantos acumulados absorben toda la utilidad generada.`,
    ],
  });

  // Unit economics
  secciones.push({
    titulo: 'Economía por usuario',
    parrafos: [
      `Cada usuario activo deja ${fmtU(r.margenContribucionUsuario)} de margen por mes después de costos variables, y cuesta ${fmtU(r.cac)} adquirirlo.`,
      r.mesesRecuperoCac !== null
        ? `El costo de adquisición se recupera en ${r.mesesRecuperoCac.toFixed(1)} meses, contra una permanencia promedio de ${Number.isFinite(vidaMeses) ? vidaMeses.toFixed(1) : '∞'} meses.`
        : `Con margen de contribución negativo, el costo de adquisición no se recupera nunca: cada usuario nuevo agranda la pérdida.`,
      r.ltvCac !== null
        ? `La relación LTV/CAC es ${r.ltvCac.toFixed(1)}x (LTV ${fmtU(r.ltv)}). La referencia habitual para escalar con inversión es 3x.`
        : `No se puede calcular LTV/CAC con un costo de adquisición en cero.`,
    ],
  });

  // --- alertas ----------------------------------------------------------
  if (r.margenContribucionUsuario <= 0) {
    alertas.push('El margen de contribución por usuario es negativo: cada usuario nuevo aumenta la pérdida. Crecer empeora el resultado hasta corregir precio o costos variables.');
  }
  if (r.ltvCac !== null && r.ltvCac < 3 && r.margenContribucionUsuario > 0) {
    alertas.push(`LTV/CAC de ${r.ltvCac.toFixed(1)}x, por debajo de la referencia de 3x. Con esa relación la adquisición paga poco: conviene bajar el CAC o subir la retención antes de invertir en escala.`);
  }
  if (seQuedaSinCaja) {
    alertas.push(`La caja se agota en el mes ${r.mesSinCaja}. Sin financiamiento adicional de ${fmt(capitalNecesario)} la operación se corta antes de llegar al equilibrio.`);
  }
  if (a.growth.techoUsuarios <= 0) {
    alertas.push('No hay techo de mercado configurado: el crecimiento porcentual se proyecta sin límite y sobreestima los años finales.');
  }
  if (a.growth.churnPct <= 0) {
    alertas.push('El churn está en cero, lo que asume que ningún usuario se va nunca. El LTV queda acotado a 60 meses, pero aun así es optimista.');
  }
  if (a.growth.churnPct >= a.growth.crecimientoPct && a.growth.modoCrecimiento === 'porcentaje') {
    alertas.push(`El churn (${pctStr(a.growth.churnPct)}) iguala o supera el crecimiento (${pctStr(a.growth.crecimientoPct)}): la base se achica en lugar de crecer.`);
  }
  const pspSobreComision = a.revenue.comisionPct > 0 ? (a.costs.pspPct / a.revenue.comisionPct) * 100 : 0;
  if (pspSobreComision >= 40) {
    alertas.push(`La comisión del medio de pago (${pctStr(a.costs.pspPct)}) se lleva el ${pctStr(pspSobreComision)} de la comisión que cobrás (${pctStr(a.revenue.comisionPct)}). Es el costo variable más pesado del modelo.`);
  }

  // --- markdown ---------------------------------------------------------
  const md: string[] = [];
  md.push('# Proyección financiera — DoApp', '');
  md.push(`_Generado el ${new Date().toLocaleDateString('es-AR')} · horizonte de ${horizonte} meses desde ${etiquetaMes(1)}_`, '');
  md.push('## Resumen ejecutivo', '', `**${titular}**`, '', resumen, '');
  for (const s of secciones) {
    md.push(`## ${s.titulo}`, '');
    for (const p of s.parrafos) md.push(p, '');
  }
  if (alertas.length > 0) {
    md.push('## Alertas', '');
    for (const al of alertas) md.push(`- ${al}`);
    md.push('');
  }
  md.push('## Detalle mensual', '');
  md.push('| Mes | Usuarios | Ingresos | Costos | EBITDA | Impuestos | Neto | Caja |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const m of meses) {
    md.push(
      `| ${m.etiqueta} | ${n0(m.usuarios)} | ${fmt(m.ingresoNeto)} | ${fmt(m.costosTotales)} | ${fmt(m.ebitda)} | ${fmt(m.impuestosTotales)} | ${fmt(m.resultadoNeto)} | ${fmt(m.cajaAcumulada)} |`
    );
  }
  md.push('', '_Los montos son proyecciones sobre supuestos cargados a mano, no una previsión contable. Validá las alícuotas con un contador._');

  return { veredicto, titular, resumen, secciones, alertas, markdown: md.join('\n') };
}

/** Detalle mensual en CSV, para abrirlo en una planilla */
export function projectionToCsv(projection: Projection): string {
  const headers = [
    'Mes', 'Etiqueta', 'Usuarios', 'Altas', 'Bajas', 'Contratos', 'GMV',
    'Ingreso bruto', 'Ingreso neto', 'Comision', 'Membresias', 'Publicidad',
    'Costos variables', 'Adquisicion', 'Costos fijos', 'Costos totales',
    'EBITDA', 'IVA', 'IIBB', 'Cheque', 'Ganancias', 'Impuestos totales',
    'Resultado neto', 'Flujo de caja', 'Caja acumulada',
  ];
  const round = (n: number) => Math.round(n * 100) / 100;
  const rows = projection.meses.map(m => [
    m.mes, m.etiqueta, m.usuarios, m.altas, m.bajas, m.contratos, round(m.gmv),
    round(m.ingresoBruto), round(m.ingresoNeto), round(m.ingresoComision),
    round(m.ingresoMembresias), round(m.ingresoPublicidad),
    round(m.costosVariables), round(m.costoAdquisicion), round(m.costosFijos),
    round(m.costosTotales), round(m.ebitda), round(m.iva), round(m.iibb),
    round(m.cheque), round(m.ganancias), round(m.impuestosTotales),
    round(m.resultadoNeto), round(m.flujoCaja), round(m.cajaAcumulada),
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
