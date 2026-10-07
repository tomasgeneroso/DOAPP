import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  TrendingUp,
  Users,
  Layers,
  FileText,
  Download,
  Copy,
  Check,
  AlertTriangle,
  Table as TableIcon,
  Database,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import Concepto from '@/components/ui/Concepto';
import {
  projectFinancials,
  proyeccionHastaMes,
  resumenPorHorizonte,
  applyScenario,
  monthLabel,
  HORIZONTES,
  SCENARIOS,
  type AniosDeHorizonte,
  type ProjectionAssumptions,
  type ScenarioKey,
} from '@/utils/financialProjection';
import { buildReport, projectionToCsv } from '@/utils/financialReport';
import { SECCIONES_DEL_PLAN } from '../../content/seccionesDelPlan';

/* ------------------------------------------------------------------ *
 * Paleta de series
 *
 * Orden fijo de slots (nunca ciclado) validado para daltonismo y
 * contraste sobre las dos superficies del panel: blanco en claro y
 * slate-800 en oscuro. En claro, aqua y amarillo quedan por debajo de
 * 3:1, así que las series van siempre con leyenda y la tabla mensual
 * queda a la vista — la identidad nunca depende sólo del color.
 * ------------------------------------------------------------------ */
const SERIES = {
  light: { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100' },
  dark: { s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500' },
};

const CARD = 'bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700';
const FIELD =
  'w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-right tabular-nums text-slate-900 dark:text-white focus:border-sky-500 focus:outline-none';
const SELECT =
  'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:outline-none';

/** Números reales de la plataforma, en ARS */
export interface PlatformActuals {
  mau: number;
  usuariosTotales: number;
  contratosPorUsuario: number;
  ticketPromedio: number;
  comisionPromedio: number;
}

interface Props {
  assumptions: ProjectionAssumptions;
  /** Datos reales para arrancar la proyección desde lo que ya pasa */
  actuals?: PlatformActuals | null;
  /** Edita los supuestos dentro del plan guardado */
  onEdit: (mutate: (a: ProjectionAssumptions) => void) => void;
  /** Moneda en la que están cargados los supuestos */
  currency: string;
  onCurrencyChange: (c: string) => void;
  fmt: (n: number, decimals?: number) => string;
}

/** Etiqueta corta para los ejes: 1.2M, 340k, 900 */
const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return Math.round(n).toString();
};

export default function FinancialProjectionPanel({
  assumptions,
  actuals,
  onEdit,
  currency,
  onCurrencyChange,
  fmt,
}: Props) {
  const { isDark } = useTheme();
  const C = isDark ? SERIES.dark : SERIES.light;
  const axis = isDark ? '#94a3b8' : '#64748b';
  const grid = isDark ? '#334155' : '#e2e8f0';
  const surface = isDark ? '#1e293b' : '#ffffff';
  const ink = isDark ? '#f1f5f9' : '#0f172a';

  const [scenario, setScenario] = useState<ScenarioKey>('base');
  // Cuánto se mira de la proyección: 1, 3, 5 o 10 años. El motor corre siempre 120
  // meses; esto sólo decide cuántos se muestran y se resumen.
  const [vista, setVista] = useState<AniosDeHorizonte>(3);
  const [showTable, setShowTable] = useState(false);
  const [copied, setCopied] = useState(false);

  const mesesDeLaVista = HORIZONTES.find(h => h.anios === vista)!.meses;
  const rotuloDeLaVista = HORIZONTES.find(h => h.anios === vista)!.rotulo;

  // El informe tiene que describir los mismos supuestos que grafica: si hay
  // un escenario aplicado, los números y el texto salen de esos supuestos.
  const activeAssumptions = useMemo(
    () => (scenario === 'base' ? assumptions : applyScenario(assumptions, scenario)),
    [assumptions, scenario]
  );

  // UNA corrida de 120 meses; los horizontes son tramos de ella. Correr el motor
  // una vez por horizonte daría lo mismo con cuatro veces el trabajo y la chance de
  // que dos corridas no coincidan.
  const corridaCompleta = useMemo(() => projectFinancials(activeAssumptions), [activeAssumptions]);

  const projection = useMemo(
    () => proyeccionHastaMes(corridaCompleta, activeAssumptions, mesesDeLaVista),
    [corridaCompleta, activeAssumptions, mesesDeLaVista]
  );

  const porHorizonte = useMemo(
    () => resumenPorHorizonte(corridaCompleta, activeAssumptions),
    [corridaCompleta, activeAssumptions]
  );

  // Los tres escenarios, para comparar la caja acumulada
  const scenarios = useMemo(
    () =>
      (Object.keys(SCENARIOS) as ScenarioKey[]).map(key => {
        const variante = key === 'base' ? assumptions : applyScenario(assumptions, key);
        return {
          key,
          label: SCENARIOS[key].label,
          projection: proyeccionHastaMes(projectFinancials(variante), variante, mesesDeLaVista),
        };
      }),
    [assumptions, mesesDeLaVista]
  );

  const money = (n: number) => fmt(n, 0);
  const moneyUnit = (n: number) => fmt(n, Math.abs(n) < 100 ? 2 : 0);

  const report = useMemo(
    () =>
      buildReport(projection, activeAssumptions, {
        fmt: money,
        fmtUnit: moneyUnit,
        etiquetaMes: (mes: number) => monthLabel(assumptions.growth.mesInicio, mes - 1),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection, activeAssumptions, currency]
  );

  const r = projection.resumen;
  const mesesBeta = r.mesesDeBeta;

  const cashData = useMemo(
    () =>
      projection.meses.map((m, i) => ({
        mes: m.etiqueta,
        caja: Math.round(m.cajaAcumulada),
        conservador: Math.round(scenarios[0].projection.meses[i]?.cajaAcumulada ?? 0),
        base: Math.round(scenarios[1].projection.meses[i]?.cajaAcumulada ?? 0),
        optimista: Math.round(scenarios[2].projection.meses[i]?.cajaAcumulada ?? 0),
      })),
    [projection, scenarios]
  );

  const pnlData = useMemo(
    () =>
      projection.meses.map(m => ({
        mes: m.etiqueta,
        ingresos: Math.round(m.ingresoNeto),
        costos: Math.round(m.costosTotales),
        impuestos: Math.round(m.impuestosTotales),
      })),
    [projection]
  );

  const costData = useMemo(
    () =>
      projection.meses.map(m => ({
        mes: m.etiqueta,
        fijos: Math.round(m.costosFijos),
        variables: Math.round(m.costosVariables),
        adquisicion: Math.round(m.costoAdquisicion),
        impuestos: Math.round(m.impuestosTotales),
      })),
    [projection]
  );

  const usersData = useMemo(
    () =>
      projection.meses.map(m => ({
        mes: m.etiqueta,
        usuarios: m.usuarios,
        altas: m.altas,
      })),
    [projection]
  );

  const tooltipStyle = {
    backgroundColor: surface,
    border: `1px solid ${grid}`,
    borderRadius: 8,
    color: ink,
    fontSize: 12,
  };

  const axisProps = {
    stroke: axis,
    tick: { fill: axis, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: grid },
  };

  /** Muestra una etiqueta de mes cada N, para que no se pisen */
  const tickEvery = Math.max(1, Math.round(projection.meses.length / 12));
  const monthTick = (value: string, index: number) =>
    index % tickEvery === 0 ? value : '';

  /** La zona de la beta, sombreada en cada gráfico: ahí no se cobra comisión. */
  const zonaDeLaBeta = mesesBeta > 0 && (
    <ReferenceArea
      x1={projection.meses[0].etiqueta}
      x2={projection.meses[mesesBeta - 1].etiqueta}
      fill={C.s4}
      fillOpacity={0.14}
      stroke="none"
      ifOverflow="visible"
    />
  );

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el portapapeles puede estar bloqueado: el botón de descarga sigue */
    }
  };

  const verdictTone =
    report.veredicto === 'viable'
      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
      : report.veredicto === 'ajustado'
        ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
        : 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200';

  // Los campos editables muestran siempre el plan real, no el escenario
  const g = assumptions.growth;
  const rev = assumptions.revenue;
  const cost = assumptions.costs;
  const tax = assumptions.taxes;
  const mesesDeBetaDelPlan = assumptions.beta?.meses ?? 0;

  const numField = (
    label: string,
    value: number,
    apply: (a: ProjectionAssumptions, v: number) => void,
    step = 1,
    suffix?: string
  ) => (
    <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50">
      <div className="flex-1">
        <label className="text-sm text-slate-600 dark:text-slate-400"><Concepto c={label} /></label>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          className={`${FIELD} w-24`}
          value={value}
          onChange={e => onEdit(a => apply(a, Math.max(0, +e.target.value) || 0))}
        />
        {suffix && <span className="w-4 text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  );

  /**
   * Un supuesto que NO se carga acá: lo deriva el plan de otra sección. Se muestra
   * con su valor y de dónde viene, para que quien lo busque para cambiarlo sepa a
   * dónde ir; un campo editable acá volvía a abrir el hueco de tener dos versiones.
   */
  const campoDerivado = (label: string, valor: string, viene: string) => (
    <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50">
      <div className="flex-1">
        <span className="text-sm text-slate-600 dark:text-slate-400"><Concepto c={label} /></span>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm tabular-nums text-slate-900 dark:text-white">{valor}</p>
        <p className="text-[10px] leading-tight text-slate-400">viene de {viene}</p>
      </div>
    </div>
  );

  const celdaDeHorizonte = 'px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400';

  return (
    <>
      {/* ---------------- Supuestos ---------------- */}
      <section className={`${CARD} mb-6 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-sky-600 dark:text-sky-400">
              {SECCIONES_DEL_PLAN.supuestos}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Supuestos del modelo</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              De acá salen todos los gráficos y el informe. Lo que dice «viene de…» no se carga acá: lo toma de otra sección, para que
              el plan diga lo mismo en todas partes. Lo demás sí se carga acá. Pasá el mouse por un concepto para ver qué es; el detalle
              está en la{' '}
              <Link to="/analisis?tab=guia" className="text-sky-600 underline dark:text-sky-400">guía del análisis</Link>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              Moneda
              <select className={SELECT} value={currency} onChange={e => onCurrencyChange(e.target.value)}>
                {['ARS', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {actuals && actuals.usuariosTotales > 0 && (
              <button
                onClick={() =>
                  onEdit(a => {
                    a.growth.usuariosIniciales = actuals.usuariosTotales;
                    // De cada 100 registrados, cuántos son activos: es lo que mide hoy la plataforma.
                    if (actuals.mau > 0) {
                      a.growth.activosPct = Math.min(100, Math.round((actuals.mau / actuals.usuariosTotales) * 1000) / 10);
                    }
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
              >
                <Database className="h-3.5 w-3.5" /> Arrancar de los datos reales
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Concepto c="Escenario" />
              <select className={SELECT} value={scenario} onChange={e => setScenario(e.target.value as ScenarioKey)}>
                {(Object.keys(SCENARIOS) as ScenarioKey[]).map(k => (
                  <option key={k} value={k}>{SCENARIOS[k].label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Usuarios
            </h3>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50">
              <div className="flex-1">
                <label className="text-sm text-slate-600 dark:text-slate-400"><Concepto c="Mes de inicio" /></label>
              </div>
              {/* En un contenedor de ancho fijo: `FIELD` trae w-full, que le ganaba a
                  w-36 y dejaba la etiqueta aplastada en una columna. */}
              <div className="w-36 shrink-0">
                <input
                  type="month"
                  className={`${FIELD} text-left`}
                  value={g.mesInicio}
                  onChange={e => onEdit(a => { a.growth.mesInicio = e.target.value; })}
                />
              </div>
            </div>
            {numField('Usuarios registrados al arrancar', g.usuariosIniciales, (a, v) => { a.growth.usuariosIniciales = v; })}
            {numField('Usuarios activos del mes (% de los registrados)', g.activosPct ?? 0, (a, v) => { a.growth.activosPct = Math.min(100, v); }, 1, '%')}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50">
              <div className="flex-1">
                <label className="text-sm text-slate-600 dark:text-slate-400"><Concepto c="Cómo crece la base" /></label>
              </div>
              <select
                className={SELECT}
                value={g.modoCrecimiento}
                onChange={e => onEdit(a => { a.growth.modoCrecimiento = e.target.value as 'porcentaje' | 'absoluto'; })}
              >
                <option value="absoluto">altas fijas (publicidad ÷ CAC)</option>
                <option value="porcentaje">% sobre la base</option>
              </select>
            </div>
            {g.modoCrecimiento === 'porcentaje'
              ? numField('Crecimiento mensual de usuarios', g.crecimientoPct, (a, v) => { a.growth.crecimientoPct = v; }, 0.5, '%')
              : campoDerivado('Altas por mes en la etapa real', `${Math.round(g.altasPorMes).toLocaleString('es-AR')} usuarios`, SECCIONES_DEL_PLAN.gastosReal)}
            {campoDerivado('Altas por mes en la beta', `${Math.round(assumptions.beta?.altasPorMes ?? 0).toLocaleString('es-AR')} usuarios`, SECCIONES_DEL_PLAN.gastosBeta)}
            {campoDerivado('Duración de la beta', `${mesesDeBetaDelPlan} ${mesesDeBetaDelPlan === 1 ? 'mes' : 'meses'}`, SECCIONES_DEL_PLAN.gastosBeta)}
            {numField('Churn mensual', g.churnPct, (a, v) => { a.growth.churnPct = v; }, 0.5, '%')}
            {numField('Techo de mercado (0 = sin techo)', g.techoUsuarios, (a, v) => { a.growth.techoUsuarios = v; }, 1000)}

            <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ingresos
            </h3>
            {campoDerivado('Ticket promedio por contrato', money(rev.ticket), SECCIONES_DEL_PLAN.unitEconomics)}
            {campoDerivado('Contratos por usuario registrado / mes', rev.contratosPorUsuario.toLocaleString('es-AR', { maximumFractionDigits: 3 }), `${SECCIONES_DEL_PLAN.unitEconomics} × % de activos`)}
            {campoDerivado('Comisión de la plataforma', `${rev.comisionPct}% (beta: ${assumptions.beta?.comisionPct ?? 0}%)`, SECCIONES_DEL_PLAN.unitEconomics)}
            {numField('Usuarios con membresía', rev.membresiaPct, (a, v) => { a.revenue.membresiaPct = v; }, 0.5, '%')}
            {numField('Precio de la membresía / mes', rev.membresiaPrecio, (a, v) => { a.revenue.membresiaPrecio = v; })}
            {numField('Publicidad de terceros (ingreso) / mes', rev.publicidadMensual, (a, v) => { a.revenue.publicidadMensual = v; })}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50">
              <div className="flex-1">
                <label className="text-sm text-slate-600 dark:text-slate-400"><Concepto c="La comisión se cobra con IVA incluido" /></label>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-600"
                checked={rev.ingresosConIva}
                onChange={e => onEdit(a => { a.revenue.ingresosConIva = e.target.checked; })}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Costos
            </h3>
            {campoDerivado('Soporte por usuario registrado / mes', moneyUnit(cost.soportePorUsuario), `${SECCIONES_DEL_PLAN.unitEconomics} × % de activos`)}
            {numField('Infraestructura por usuario / mes', cost.infraPorUsuario, (a, v) => { a.costs.infraPorUsuario = v; }, 0.05)}
            {numField('Comisión del medio de pago', cost.pspPct, (a, v) => { a.costs.pspPct = v; }, 0.1, '%')}
            {campoDerivado('Disputas (% del volumen)', `${cost.disputasPct}%`, SECCIONES_DEL_PLAN.unitEconomics)}
            {campoDerivado('Fraude y contracargos (% del volumen)', `${cost.fraudePct}%`, SECCIONES_DEL_PLAN.unitEconomics)}
            {numField('Costo de adquirir un usuario (CAC)', cost.cac, (a, v) => { a.costs.cac = v; }, 0.5)}
            {campoDerivado('Costos fijos de la etapa real', money(cost.fijosMensuales), SECCIONES_DEL_PLAN.gastosReal)}
            {numField('Crecimiento mensual de los fijos', cost.fijosCrecimientoPct, (a, v) => { a.costs.fijosCrecimientoPct = v; }, 0.5, '%')}
            {numField('Costos con IVA computable', cost.costosConIvaPct, (a, v) => { a.costs.costosConIvaPct = Math.min(100, v); }, 5, '%')}

            <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Impuestos
            </h3>
            {numField('IVA', tax.ivaPct, (a, v) => { a.taxes.ivaPct = v; }, 0.5, '%')}
            {numField('Ingresos Brutos', tax.iibbPct, (a, v) => { a.taxes.iibbPct = v; }, 0.1, '%')}
            {numField('Débitos y créditos bancarios', tax.chequePct, (a, v) => { a.taxes.chequePct = v; }, 0.1, '%')}
            {numField('Impuesto a las Ganancias', tax.gananciasPct, (a, v) => { a.taxes.gananciasPct = v; }, 1, '%')}
            <p className="mt-3 rounded border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Las alícuotas vienen precargadas con los valores habituales para una SAS. Ingresos Brutos
              depende de la provincia y Ganancias tiene escala por tramos: confirmá con un contador.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Resultado ---------------- */}
      <section className={`${CARD} mb-6 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-sky-600 dark:text-sky-400">
              {SECCIONES_DEL_PLAN.resultado}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Proyección a {rotuloDeLaVista} — escenario {SCENARIOS[scenario].label.toLowerCase()}
            </h2>
          </div>
          <div role="group" aria-label="Horizonte de la proyección" className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {HORIZONTES.map(h => (
              <button
                key={h.anios}
                type="button"
                aria-pressed={vista === h.anios}
                onClick={() => setVista(h.anios)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  vista === h.anios
                    ? 'bg-sky-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {h.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Los cuatro horizontes, juntos: es la respuesta a "¿y a 1, 3, 5 y 10 años?" */}
        <div className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Horizonte', 'Usuarios registrados', 'Ingresos del último año', 'EBITDA del último año', 'Resultado acumulado', 'Caja acumulada', 'Capital mínimo necesario', 'Mes en que cubre costos'].map(h => (
                  <th key={h} className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 first:text-left dark:text-slate-400">
                    {h === 'Horizonte' ? h : <Concepto c={h} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porHorizonte.map(h => (
                <tr
                  key={h.anios}
                  onClick={() => setVista(h.anios)}
                  className={`cursor-pointer border-b border-slate-100 dark:border-slate-700/50 ${h.anios === vista ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                >
                  <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200">{h.rotulo}</td>
                  <td className={celdaDeHorizonte}>{h.usuarios.toLocaleString('es-AR')}</td>
                  <td className={celdaDeHorizonte}>{money(h.ingresosDelUltimoAnio)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-medium ${h.ebitdaDelUltimoAnio >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {money(h.ebitdaDelUltimoAnio)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums font-medium ${h.resultadoAcumulado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {money(h.resultadoAcumulado)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums font-medium ${h.cajaAcumulada >= 0 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600 dark:text-rose-400'}`}>
                    {money(h.cajaAcumulada)}
                  </td>
                  <td className={celdaDeHorizonte}>{money(h.capitalMinimo)}</td>
                  <td className={celdaDeHorizonte}>{h.mesEbitdaPositivo ? `mes ${h.mesEbitdaPositivo}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mesesBeta > 0 && (
          <p className="mb-4 rounded border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Los primeros {mesesBeta} {mesesBeta === 1 ? 'mes es' : 'meses son'} de <Concepto c="Beta" /> (zona sombreada en los gráficos):
            sin comisión
            {r.cajaAlTerminarLaBeta !== null && <> y con {money(r.cajaAlTerminarLaBeta)} en caja al terminar</>}. Desde ahí rige la{' '}
            <Concepto c="Etapa real" />.
          </p>
        )}

        {/* Hitos */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              l: 'Cubre sus costos',
              v: r.mesEbitdaPositivo ? `Mes ${r.mesEbitdaPositivo}` : 'No llega',
              s: r.mesEbitdaPositivo ? monthLabel(g.mesInicio, r.mesEbitdaPositivo - 1) : `en ${projection.meses.length} meses`,
              ok: r.mesEbitdaPositivo !== null,
            },
            {
              l: 'Resultado neto positivo',
              v: r.mesResultadoPositivo ? `Mes ${r.mesResultadoPositivo}` : 'No llega',
              s: r.mesResultadoPositivo ? monthLabel(g.mesInicio, r.mesResultadoPositivo - 1) : 'ya con impuestos',
              ok: r.mesResultadoPositivo !== null,
            },
            {
              l: 'Capital mínimo necesario',
              v: r.pisoCaja < 0 ? money(Math.abs(r.pisoCaja)) : money(0),
              s: r.pisoCaja < 0 ? `pozo en el mes ${r.mesPisoCaja}` : 'la caja nunca queda en rojo',
              ok: r.pisoCaja >= 0,
            },
            {
              l: 'Caja acumulada',
              v: money(r.cajaFinal),
              s: `al mes ${projection.meses.length} · ${r.usuariosFinales.toLocaleString('es-AR')} usuarios`,
              ok: r.cajaFinal >= 0,
            },
          ].map(k => (
            <div
              key={k.l}
              className={`rounded-lg border-l-4 bg-slate-50 p-3 dark:bg-slate-900/50 ${k.ok ? 'border-emerald-500' : 'border-rose-500'}`}
            >
              <p className="text-xs text-slate-500 dark:text-slate-400"><Concepto c={k.l} /></p>
              <p className={`text-lg font-bold tabular-nums ${k.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {k.v}
              </p>
              <p className="truncate text-xs text-slate-400">{k.s}</p>
            </div>
          ))}
        </div>

        {/* Caja acumulada por escenario */}
        <div className="mb-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <TrendingUp className="h-4 w-4 text-slate-400" /> <Concepto c="Caja acumulada" />
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Dónde queda la plata mes a mes. Por debajo de la línea de cero hace falta financiamiento.
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={cashData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="mes" {...axisProps} tickFormatter={monthTick} interval={0} />
              <YAxis {...axisProps} tickFormatter={compact} width={56} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any, n: any) => [money(Number(v)), n]}
                cursor={{ stroke: axis, strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
              {zonaDeLaBeta}
              <ReferenceLine y={0} stroke={axis} strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="base"
                name="Base"
                stroke={C.s1}
                strokeWidth={2}
                fill={C.s1}
                fillOpacity={0.14}
                dot={false}
                activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }}
              />
              <Line type="monotone" dataKey="conservador" name="Conservador" stroke={C.s2} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="optimista" name="Optimista" stroke={C.s3} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Ingresos, costos e impuestos */}
        <div className="mb-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Layers className="h-4 w-4 text-slate-400" /> <Concepto c="Ingresos, costos e impuestos" />
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            El mes en que la línea de ingresos cruza la de costos es el punto de equilibrio operativo.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={pnlData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="mes" {...axisProps} tickFormatter={monthTick} interval={0} />
              <YAxis {...axisProps} tickFormatter={compact} width={56} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any, n: any) => [money(Number(v)), n]}
                cursor={{ stroke: axis, strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
              {zonaDeLaBeta}
              <Line type="monotone" dataKey="ingresos" name="Ingresos netos" stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }} />
              <Line type="monotone" dataKey="costos" name="Costos totales" stroke={C.s2} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }} />
              <Line type="monotone" dataKey="impuestos" name="Impuestos" stroke={C.s3} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Composición del gasto */}
        <div className="mb-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Layers className="h-4 w-4 text-slate-400" /> <Concepto c="En qué se va la plata" />
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Costos e impuestos apilados por mes: sirve para ver cuál crece más rápido que los ingresos.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={costData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="mes" {...axisProps} tickFormatter={monthTick} interval={0} />
              <YAxis {...axisProps} tickFormatter={compact} width={56} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any, n: any) => [money(Number(v)), n]}
                cursor={{ fill: isDark ? '#33415555' : '#f1f5f9' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
              {zonaDeLaBeta}
              <Bar dataKey="fijos" name="Fijos" stackId="c" fill={C.s1} stroke={surface} strokeWidth={2} />
              <Bar dataKey="variables" name="Variables" stackId="c" fill={C.s2} stroke={surface} strokeWidth={2} />
              <Bar dataKey="adquisicion" name="Adquisición" stackId="c" fill={C.s3} stroke={surface} strokeWidth={2} />
              <Bar dataKey="impuestos" name="Impuestos" stackId="c" fill={C.s4} stroke={surface} strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Usuarios — unidad distinta, gráfico aparte */}
        <div>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Users className="h-4 w-4 text-slate-400" /> <Concepto c="Base de usuarios" />
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Usuarios registrados y altas de cada mes. Si las altas se aplanan, el techo de mercado ya está pesando.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={usersData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="mes" {...axisProps} tickFormatter={monthTick} interval={0} />
              <YAxis {...axisProps} tickFormatter={compact} width={56} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any, n: any) => [Number(v).toLocaleString('es-AR'), n]}
                cursor={{ stroke: axis, strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
              {zonaDeLaBeta}
              <Line type="monotone" dataKey="usuarios" name="Usuarios registrados" stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }} />
              <Line type="monotone" dataKey="altas" name="Altas del mes" stroke={C.s2} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tabla mensual */}
        <div className="mt-6">
          <button
            onClick={() => setShowTable(v => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <TableIcon className="h-3.5 w-3.5" />
            {showTable ? 'Ocultar detalle mensual' : 'Ver detalle mensual'}
          </button>

          {showTable && (
            <div className="mt-3 max-h-[560px] overflow-auto">
              <table className="w-full min-w-[920px] border-collapse text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-800">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Mes', 'Etapa', 'Usuarios', 'Contratos', 'Ingresos', 'Costos', 'EBITDA', 'Impuestos', 'Neto', 'Caja'].map(h => (
                      <th key={h} className="px-2 py-2 text-right font-semibold uppercase tracking-wide text-slate-500 first:text-left dark:text-slate-400">
                        {h === 'Mes' ? h : <Concepto c={h} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projection.meses.map(m => (
                    <tr key={m.mes} className={`border-b border-slate-100 dark:border-slate-700/50 ${m.etapa === 'beta' ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{m.etiqueta}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">{m.etapa === 'beta' ? 'Beta' : 'Real'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{m.usuarios.toLocaleString('es-AR')}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{m.contratos.toLocaleString('es-AR')}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{money(m.ingresoNeto)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{money(m.costosTotales)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${m.ebitda >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {money(m.ebitda)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{money(m.impuestosTotales)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${m.resultadoNeto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {money(m.resultadoNeto)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${m.cajaAcumulada >= 0 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600 dark:text-rose-400'}`}>
                        {money(m.cajaAcumulada)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Informe ---------------- */}
      <section className={`${CARD} mb-6 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-sky-600 dark:text-sky-400">
              {SECCIONES_DEL_PLAN.informe}
            </p>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <FileText className="h-4 w-4 text-slate-400" /> Lectura a {rotuloDeLaVista}, escenario {SCENARIOS[scenario].label.toLowerCase()}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyReport}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar informe'}
            </button>
            <button
              onClick={() => download(`proyeccion-doapp-${scenario}-${vista}a.md`, report.markdown, 'text/markdown')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" /> Informe .md
            </button>
            <button
              onClick={() => download(`proyeccion-doapp-${scenario}-${vista}a.csv`, projectionToCsv(projection), 'text/csv')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" /> Detalle .csv
            </button>
          </div>
        </div>

        <div className={`mb-4 rounded-lg border-l-4 p-4 ${verdictTone}`}>
          <p className="font-semibold">{report.titular}</p>
          <p className="mt-1 text-sm opacity-90">{report.resumen}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {report.secciones.map(s => (
            <div key={s.titulo}>
              <h3 className="mb-1.5 text-sm font-bold text-slate-900 dark:text-white">{s.titulo}</h3>
              <div className="space-y-2">
                {s.parrafos.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {report.alertas.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> Alertas
            </h3>
            <ul className="space-y-1.5">
              {report.alertas.map((a, i) => (
                <li key={i} className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">• {a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Comparación de escenarios */}
        <div className="mt-5 overflow-x-auto">
          <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Los tres escenarios a {rotuloDeLaVista}</h3>
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Escenario', 'Cubre sus costos', 'Capital mínimo', 'Caja acumulada', 'Usuarios registrados', 'LTV/CAC'].map(h => (
                  <th key={h} className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 first:text-left dark:text-slate-400">
                    <Concepto c={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => {
                const sr = s.projection.resumen;
                return (
                  <tr key={s.key} className={`border-b border-slate-100 dark:border-slate-700/50 ${s.key === scenario ? 'bg-sky-50 dark:bg-sky-900/20' : ''}`}>
                    <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200"><Concepto c={s.label} /></td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {sr.mesEbitdaPositivo ? `mes ${sr.mesEbitdaPositivo}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {sr.pisoCaja < 0 ? money(Math.abs(sr.pisoCaja)) : money(0)}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${sr.cajaFinal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {money(sr.cajaFinal)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {sr.usuariosFinales.toLocaleString('es-AR')}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {sr.ltvCac !== null ? `${sr.ltvCac.toFixed(1)}x` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
