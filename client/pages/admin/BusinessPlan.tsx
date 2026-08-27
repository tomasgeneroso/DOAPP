import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import FinancialProjectionPanel from '@/components/admin/FinancialProjectionPanel';
import type { ProjectionAssumptions } from '@/utils/financialProjection';
import {
  Calculator,
  Lock,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
  CalendarClock,
  ClipboardCheck,
  AlertTriangle,
  Check,
  Database,
  CloudOff,
} from 'lucide-react';

/* ------------------------------------------------------------------ *
 * Tipos del plan
 * ------------------------------------------------------------------ */

type Currency = 'ARS' | 'USD' | 'EUR';

interface ConstRow { c: string; d: string; m: number; f: string; e: string }
interface BudgetRow { c: string; m: number; n: string }
interface CheckItem { t: string; w: number; on: boolean }
interface TimelineRow { h: string; d: string; s: string }

interface UnitEconomics {
  comision: number;
  ticket: number;
  contratos: number;
  disputas: number;
  soporte: number;
  fijos: number;
  fraude: number;
  mauActual: number;
}

interface Plan {
  baseCurrency: Currency;
  rateArs: number;
  rateUsd: number;
  ratesUpdatedAt: string | null;
  capitalCurrency: Currency;
  capitalInicial: number;
  constCurrency: Currency;
  const: ConstRow[];
  budgetCurrency: Currency;
  budget: BudgetRow[];
  checklist: CheckItem[];
  timeline: TimelineRow[];
  ueCurrency: Currency;
  ue: UnitEconomics;
  projectionCurrency: Currency;
  /** Supuestos del modelo mes a mes; la caja inicial se calcula acá */
  projection: Omit<ProjectionAssumptions, 'cajaInicial'>;
}

interface Actuals {
  currency: string;
  mau: number;
  contratosUltimos30: number;
  contratosPorUsuario: number;
  ticketPromedio: number;
  comisionPromedio: number;
  ingresoUltimos30: number;
  usuariosTotales: number;
  calculadoEn: string;
}

const CURRENCIES: Currency[] = ['ARS', 'USD', 'EUR'];
const SYMBOLS: Record<Currency, string> = { ARS: '$', USD: 'US$', EUR: '€' };
const CONST_STATES = ['Pendiente', 'En trámite', 'Pagado'];
const TIMELINE_STATES = ['Pendiente', 'En curso', 'Cumplido'];

const token = () => localStorage.getItem('token');

/* ------------------------------------------------------------------ *
 * Conversión: las tasas se guardan contra el euro y desde ahí se pasa
 * a la moneda de referencia que elija el owner.
 * ------------------------------------------------------------------ */

const toEur = (amount: number, from: Currency, plan: Plan) => {
  const value = Number(amount) || 0;
  if (from === 'EUR') return value;
  if (from === 'ARS') return value / (plan.rateArs || 1);
  return value / (plan.rateUsd || 1);
};

const eurToBase = (plan: Plan) => {
  if (plan.baseCurrency === 'EUR') return 1;
  if (plan.baseCurrency === 'ARS') return plan.rateArs || 1;
  return plan.rateUsd || 1;
};

const toBase = (amount: number, from: Currency, plan: Plan) =>
  toEur(amount, from, plan) * eurToBase(plan);

const fmt = (n: number, currency: Currency, decimals = 0) =>
  SYMBOLS[currency] +
  (Number(n) || 0).toLocaleString('es-AR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

/* ------------------------------------------------------------------ *
 * Piezas de UI
 * ------------------------------------------------------------------ */

const CARD = 'bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700';
const INPUT =
  'w-full bg-transparent border border-transparent rounded px-2 py-1.5 text-sm text-slate-900 dark:text-white hover:border-slate-300 dark:hover:border-slate-600 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition';
const NUM_INPUT = `${INPUT} text-right tabular-nums`;
const FIELD =
  'w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-right tabular-nums text-slate-900 dark:text-white focus:border-sky-500 focus:outline-none';
const SELECT =
  'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:outline-none';

function SectionHeader({
  num,
  title,
  description,
  right,
}: {
  num: string;
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-sky-600 dark:text-sky-400">{num}</p>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>
      {right}
    </div>
  );
}

function CurrencyPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Currency;
  onChange: (c: Currency) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      {label}
      <select className={SELECT} value={value} onChange={e => onChange(e.target.value as Currency)}>
        {CURRENCIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'sky',
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  tone?: 'sky' | 'emerald' | 'amber' | 'rose';
}) {
  const tones: Record<string, string> = {
    sky: 'border-sky-500 text-sky-600 dark:text-sky-400',
    emerald: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
    amber: 'border-amber-500 text-amber-600 dark:text-amber-400',
    rose: 'border-rose-500 text-rose-600 dark:text-rose-400',
  };
  const [border, text] = [tones[tone].split(' ')[0], tones[tone].split(' ').slice(1).join(' ')];
  return (
    <div className={`${CARD} border-l-4 ${border} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`truncate text-xl font-bold tabular-nums ${text}`}>{value}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{sub}</p>
        </div>
        <Icon className={`h-5 w-5 shrink-0 ${text}`} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

export default function BusinessPlan() {
  const { user } = useAuth();
  const isOwner = user?.adminRole === 'owner';

  const [plan, setPlan] = useState<Plan | null>(null);
  const [actuals, setActuals] = useState<Actuals | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({
    updatedAt: null,
    updatedBy: null,
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  /* ---- carga ---- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/business-plan', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlan(data.data);
        setActuals(data.actuals || null);
        setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      }
    } catch (err) {
      console.error('Error cargando el plan:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner) void load();
    else setLoading(false);
  }, [load, isOwner]);

  /* ---- guardado con debounce ---- */
  const save = useCallback(async (next: Plan) => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/admin/business-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ data: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Error al guardar');
      setSaveState('saved');
      setMeta(m => ({ ...m, updatedAt: data.updatedAt }));
      dirty.current = false;
    } catch (err) {
      console.error('Error guardando el plan:', err);
      setSaveState('error');
    }
  }, []);

  /** Toda edición pasa por acá: actualiza el estado y agenda el guardado */
  const edit = useCallback((mutate: (draft: Plan) => void) => {
    setPlan(prev => {
      if (!prev) return prev;
      const next: Plan = JSON.parse(JSON.stringify(prev));
      mutate(next);
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(next), 800);
      return next;
    });
  }, [save]);

  // Si el owner cierra la pestaña con cambios sin guardar, avisamos
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const fetchRates = async () => {
    setRatesLoading(true);
    setRatesError('');
    try {
      const res = await fetch('/api/admin/business-plan/rates', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cotizar');
      edit(d => {
        d.rateArs = data.rateArs || d.rateArs;
        if (data.rateUsd) d.rateUsd = data.rateUsd;
        d.ratesUpdatedAt = data.fetchedAt;
      });
    } catch (err: any) {
      setRatesError(err.message);
    } finally {
      setRatesLoading(false);
    }
  };

  /* ---- cálculos ---- */
  const calc = useMemo(() => {
    if (!plan) return null;
    const base = plan.baseCurrency;

    const constBase = plan.const.map(r => toBase(r.m, plan.constCurrency, plan));
    const totConst = plan.const.reduce((s, r) => s + (Number(r.m) || 0), 0);
    const totConstBase = constBase.reduce((s, v) => s + v, 0);

    const capitalBase = toBase(plan.capitalInicial, plan.capitalCurrency, plan);
    const restanteBase = capitalBase - totConstBase;

    const budgetBase = plan.budget.map(r => toBase(r.m, plan.budgetCurrency, plan));
    const totBudget = plan.budget.reduce((s, r) => s + (Number(r.m) || 0), 0);
    const totBudgetBase = budgetBase.reduce((s, v) => s + v, 0);

    // Con capital negativo no hay runway: mostrar un número negativo sugiere
    // meses de operación que no existen.
    const runway = totBudgetBase > 0 && restanteBase > 0 ? restanteBase / totBudgetBase : 0;

    const ue = plan.ue;
    const ingreso = ue.ticket * ue.contratos * (ue.comision / 100);
    const costoVar =
      ue.soporte +
      ue.ticket * ue.contratos * (ue.disputas / 100) +
      ue.ticket * ue.contratos * (ue.fraude / 100);
    const margen = ingreso - costoVar;
    const beMau = margen > 0 ? Math.ceil(ue.fijos / margen) : null;
    const faltan = beMau === null ? null : Math.max(0, beMau - ue.mauActual);

    const totalWeight = plan.checklist.reduce((s, i) => s + i.w, 0) || 1;
    const doneItems = plan.checklist.filter(i => i.on);
    const pct = Math.round((doneItems.reduce((s, i) => s + i.w, 0) / totalWeight) * 100);

    return {
      base,
      constBase,
      totConst,
      totConstBase,
      capitalBase,
      restanteBase,
      budgetBase,
      totBudget,
      totBudgetBase,
      runway,
      ingreso,
      costoVar,
      margen,
      beMau,
      faltan,
      pct,
      doneCount: doneItems.length,
    };
  }, [plan]);

  // El backend también lo bloquea; acá evitamos mostrar una pantalla rota
  // a un admin que no es owner.
  if (!isOwner) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className={`${CARD} max-w-md p-8 text-center`}>
          <Lock className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Acceso restringido</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            La proyección de gastos sólo está disponible para el owner de la plataforma.
          </p>
        </div>
      </div>
    );
  }

  if (loading || !plan || !calc) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const base = plan.baseCurrency;
  const capitalNegativo = calc.restanteBase < 0;

  // La proyección se carga en su propia moneda; el capital que la alimenta
  // es el que queda después de constituir.
  const projectionCurrency = plan.projectionCurrency || 'USD';
  const fmtProjection = (n: number, decimals = 0) => fmt(n, projectionCurrency, decimals);
  const cajaInicialProyeccion =
    calc.restanteBase / (toBase(1, projectionCurrency, plan) || 1);
  const projectionAssumptions: ProjectionAssumptions = {
    ...plan.projection,
    cajaInicial: cajaInicialProyeccion,
  };
  const runwayCorto = calc.runway > 0 && calc.runway < 4;

  const saveLabel =
    saveState === 'saving' ? 'Guardando…'
    : saveState === 'error' ? 'Error al guardar'
    : saveState === 'saved' ? 'Guardado'
    : meta.updatedAt ? `Editado ${new Date(meta.updatedAt).toLocaleString('es-AR')}` : 'Sin cambios';

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-900 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Encabezado */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-sky-600 dark:text-sky-400">
              <Calculator className="h-7 w-7" /> Proyección de gastos
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Costos de constitución, runway de validación y punto de equilibrio. Sólo visible para el owner.
            </p>
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  saveState === 'saving' ? 'bg-amber-500'
                  : saveState === 'error' ? 'bg-rose-500'
                  : 'bg-emerald-500'
                }`}
              />
              {saveLabel}
              {meta.updatedBy && saveState !== 'saving' && ` · por ${meta.updatedBy}`}
              {saveState === 'error' && (
                <button onClick={() => void save(plan)} className="ml-1 underline hover:text-sky-500">
                  Reintentar
                </button>
              )}
            </p>
          </div>

          {/* Cotización */}
          <div className={`${CARD} w-full max-w-sm p-4`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cotización del día
              </p>
              <button
                onClick={fetchRates}
                disabled={ratesLoading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {ratesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Traer
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-slate-500 dark:text-slate-400">1 EUR =</span>
                <input
                  type="number"
                  className={FIELD}
                  value={plan.rateArs}
                  onChange={e => edit(d => { d.rateArs = Math.max(0, +e.target.value) || 0; })}
                />
                <span className="text-slate-500 dark:text-slate-400">ARS</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-slate-500 dark:text-slate-400">1 EUR =</span>
                <input
                  type="number"
                  step="0.01"
                  className={FIELD}
                  value={plan.rateUsd}
                  onChange={e => edit(d => { d.rateUsd = Math.max(0, +e.target.value) || 0; })}
                />
                <span className="text-slate-500 dark:text-slate-400">USD</span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-700">
                <CurrencyPicker
                  label="Mostrar todo en"
                  value={plan.baseCurrency}
                  onChange={c => edit(d => { d.baseCurrency = c; })}
                />
              </div>
              {ratesError ? (
                <p className="flex items-center gap-1.5 text-xs text-rose-500">
                  <CloudOff className="h-3.5 w-3.5" /> {ratesError}
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  {plan.ratesUpdatedAt
                    ? `Actualizada ${new Date(plan.ratesUpdatedAt).toLocaleString('es-AR')}`
                    : 'Cargada a mano — traé la del día para afinar los números.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            icon={Wallet}
            label="Costo de constitución"
            value={fmt(calc.totConstBase, base)}
            sub="pago único"
            tone="sky"
          />
          <Kpi
            icon={TrendingUp}
            label="Capital restante"
            value={fmt(calc.restanteBase, base)}
            sub={capitalNegativo ? 'no alcanza el capital' : 'tras constituir'}
            tone={capitalNegativo ? 'rose' : 'emerald'}
          />
          <Kpi
            icon={CalendarClock}
            label="Runway Fase 1"
            value={calc.runway > 0 ? `${calc.runway.toFixed(1)} meses` : '—'}
            sub={runwayCorto ? 'meta: 4 meses' : 'de operación'}
            tone={calc.runway >= 4 ? 'emerald' : runwayCorto ? 'amber' : 'rose'}
          />
          <Kpi
            icon={ClipboardCheck}
            label="Preparación Go/No-Go"
            value={`${calc.pct}%`}
            sub={`${calc.doneCount} de ${plan.checklist.length} condiciones`}
            tone={calc.pct >= 80 ? 'emerald' : calc.pct >= 50 ? 'amber' : 'rose'}
          />
        </div>

        {capitalNegativo && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Los costos de constitución superan el capital aportado en{' '}
              <strong>{fmt(Math.abs(calc.restanteBase), base)}</strong>. No queda nada para la fase de validación.
            </span>
          </div>
        )}

        {/* Datos reales */}
        {actuals && (
          <div className={`${CARD} mb-6 p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Datos reales de la plataforma</h2>
              <span className="text-xs text-slate-400">últimos 30 días</span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                { l: 'Usuarios activos', v: actuals.mau.toLocaleString('es-AR') },
                { l: 'Contratos', v: actuals.contratosUltimos30.toLocaleString('es-AR') },
                { l: 'Contratos / usuario', v: actuals.contratosPorUsuario.toFixed(2) },
                { l: 'Ticket promedio', v: fmt(actuals.ticketPromedio, 'ARS') },
                { l: 'Comisión promedio', v: `${actuals.comisionPromedio.toFixed(1)}%` },
              ].map(item => (
                <div key={item.l}>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.l}</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{item.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Ingresos por comisión en el período: {fmt(actuals.ingresoUltimos30, 'ARS')} · {actuals.usuariosTotales.toLocaleString('es-AR')} usuarios registrados
            </p>
          </div>
        )}

        {/* 01 — Constitución */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num="01 · Trámite"
            title="Costos de constitución — SAS Corrientes"
            description="Valores orientativos. Los aranceles del Registro Público de Corrientes y los honorarios del gestor varían: confirmá con un contador antes de pagar. Cargá cada monto en la moneda en la que lo pagás."
            right={
              <CurrencyPicker
                label="Moneda de la tabla"
                value={plan.constCurrency}
                onChange={c => edit(d => { d.constCurrency = c; })}
              />
            }
          />

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Capital inicial aportado
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className={FIELD}
                  value={plan.capitalInicial}
                  onChange={e => edit(d => { d.capitalInicial = Math.max(0, +e.target.value) || 0; })}
                />
                <select
                  className={SELECT}
                  value={plan.capitalCurrency}
                  onChange={e => edit(d => { d.capitalCurrency = e.target.value as Currency; })}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <p className="mt-1 text-xs text-slate-400">≈ {fmt(calc.capitalBase, base)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total de constitución
              </p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmt(calc.totConstBase, base)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{fmt(calc.totConst, plan.constCurrency)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Capital restante
              </p>
              <p className={`text-xl font-bold tabular-nums ${capitalNegativo ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {fmt(calc.restanteBase, base)}
              </p>
              <p className="mt-1 text-xs text-slate-400">disponible para la Fase 1</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Concepto', 'Monto', `≈ ${base}`, 'Fecha límite', 'Estado', ''].map((h, i) => (
                    <th
                      key={h + i}
                      className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.const.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top dark:border-slate-700/50">
                    <td className="w-2/5 px-1 py-1.5">
                      <input
                        className={INPUT}
                        value={row.c}
                        onChange={e => edit(d => { d.const[i].c = e.target.value; })}
                        aria-label="Concepto"
                      />
                      <input
                        className={`${INPUT} text-xs italic text-slate-500 dark:text-slate-400`}
                        value={row.d}
                        placeholder="Descripción / notas…"
                        onChange={e => edit(d => { d.const[i].d = e.target.value; })}
                        aria-label="Descripción"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        type="number"
                        className={NUM_INPUT}
                        value={row.m}
                        onChange={e => edit(d => { d.const[i].m = Math.max(0, +e.target.value) || 0; })}
                        aria-label="Monto"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-mono text-xs text-sky-600 dark:text-sky-400">
                      {fmt(calc.constBase[i], base)}
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        type="date"
                        className={INPUT}
                        value={row.f}
                        onChange={e => edit(d => { d.const[i].f = e.target.value; })}
                        aria-label="Fecha límite"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <select
                        className={SELECT}
                        value={row.e}
                        onChange={e => edit(d => { d.const[i].e = e.target.value; })}
                        aria-label="Estado"
                      >
                        {CONST_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        onClick={() => edit(d => { d.const.splice(i, 1); })}
                        className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        aria-label="Eliminar concepto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                  <td className="px-2 py-2 font-bold text-slate-900 dark:text-white">Total</td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {fmt(calc.totConst, plan.constCurrency)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {fmt(calc.totConstBase, base)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            onClick={() => edit(d => { d.const.push({ c: 'Nuevo concepto', d: '', m: 0, f: '', e: 'Pendiente' }); })}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-sky-500 hover:text-sky-600 dark:border-slate-600 dark:text-slate-400"
          >
            <Plus className="h-4 w-4" /> Agregar concepto
          </button>

          <p className="mt-4 rounded border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            La SAS puede constituirse 100% online vía TAD, sin escribano, con firma digital. El capital social mínimo equivale a 2 salarios mínimos, y se integra el 25% al constituir.
          </p>
        </section>

        {/* 02 — Runway */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num="02 · Runway"
            title="Presupuesto de validación — MVP Fase 1"
            description="Gasto mensual de lanzamiento en un solo barrio antes de escalar. El runway se calcula sobre el capital que queda después de constituir."
            right={
              <CurrencyPicker
                label="Moneda de la tabla"
                value={plan.budgetCurrency}
                onChange={c => edit(d => { d.budgetCurrency = c; })}
              />
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Rubro', '/ mes', `≈ ${base}`, 'Notas', ''].map((h, i) => (
                    <th key={h + i} className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.budget.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="w-1/3 px-1 py-1.5">
                      <input
                        className={INPUT}
                        value={row.c}
                        onChange={e => edit(d => { d.budget[i].c = e.target.value; })}
                        aria-label="Rubro"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        type="number"
                        className={NUM_INPUT}
                        value={row.m}
                        onChange={e => edit(d => { d.budget[i].m = Math.max(0, +e.target.value) || 0; })}
                        aria-label="Monto mensual"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs text-sky-600 dark:text-sky-400">
                      {fmt(calc.budgetBase[i], base)}
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        className={`${INPUT} text-xs text-slate-500 dark:text-slate-400`}
                        value={row.n}
                        placeholder="Notas…"
                        onChange={e => edit(d => { d.budget[i].n = e.target.value; })}
                        aria-label="Notas"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        onClick={() => edit(d => { d.budget.splice(i, 1); })}
                        className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        aria-label="Eliminar rubro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                  <td className="px-2 py-2 font-bold text-slate-900 dark:text-white">Gasto mensual</td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {fmt(calc.totBudget, plan.budgetCurrency)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {fmt(calc.totBudgetBase, base)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            onClick={() => edit(d => { d.budget.push({ c: 'Nuevo rubro', m: 0, n: '' }); })}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-sky-500 hover:text-sky-600 dark:border-slate-600 dark:text-slate-400"
          >
            <Plus className="h-4 w-4" /> Agregar rubro
          </button>

          <div className="mt-4 rounded-lg bg-slate-900 p-5 text-white dark:bg-slate-950">
            <p className="text-3xl font-bold text-emerald-400">
              {calc.runway > 0 ? `${calc.runway.toFixed(1)} meses` : '—'}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {calc.runway > 0
                ? `de runway al ritmo de gasto actual — meta de Fase 1: 4 meses`
                : capitalNegativo
                  ? 'sin capital disponible tras la constitución'
                  : 'cargá el gasto mensual para calcular el runway'}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {fmt(calc.restanteBase, base)} disponibles ÷ {fmt(calc.totBudgetBase, base)} por mes
            </p>
          </div>
        </section>

        {/* 03 — Unit economics */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num="03 · Unit economics"
            title="Punto de equilibrio"
            description="Cuántos usuarios activos mensuales hacen falta para cubrir los costos fijos. Podés traer los supuestos desde los datos reales de la plataforma."
            right={
              <CurrencyPicker
                label="Moneda de la sección"
                value={plan.ueCurrency}
                onChange={c => edit(d => { d.ueCurrency = c; })}
              />
            }
          />

          <div className="mb-4 flex flex-wrap gap-2">
            {actuals && (
              <button
                onClick={() =>
                  edit(d => {
                    // Los reales vienen en ARS: se pasan a la moneda de la sección
                    const factor = toBase(1, 'ARS', d) / (toBase(1, d.ueCurrency, d) || 1);
                    d.ue.mauActual = actuals.mau;
                    d.ue.contratos = actuals.contratosPorUsuario || d.ue.contratos;
                    if (actuals.comisionPromedio > 0) d.ue.comision = actuals.comisionPromedio;
                    if (actuals.ticketPromedio > 0) {
                      d.ue.ticket = Math.round(actuals.ticketPromedio * factor * 100) / 100;
                    }
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
              >
                <Database className="h-3.5 w-3.5" /> Usar datos reales
              </button>
            )}
            <button
              onClick={() =>
                edit(d => {
                  // Evita cargar dos veces el mismo gasto: los costos fijos
                  // salen del presupuesto de la Fase 1.
                  const budgetInUe =
                    calc.totBudgetBase / (toBase(1, d.ueCurrency, d) || 1);
                  d.ue.fijos = Math.round(budgetInUe);
                })
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Check className="h-3.5 w-3.5" /> Costos fijos = gasto de Fase 1
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
            {([
              ['Comisión promedio (%)', 'comision', 0.1],
              ['Ticket promedio por contrato', 'ticket', 1],
              ['Contratos por usuario activo / mes', 'contratos', 0.1],
              ['Costo de disputas (% de contratos)', 'disputas', 0.1],
              ['Costo de soporte por usuario / mes', 'soporte', 1],
              ['Costos fijos mensuales — equipo + infra', 'fijos', 1],
              ['Fraude / chargebacks (% de contratos)', 'fraude', 0.1],
              ['Usuarios activos actuales (MAU)', 'mauActual', 1],
            ] as [string, keyof UnitEconomics, number][]).map(([label, key, step]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50"
              >
                <label htmlFor={`ue-${key}`} className="flex-1 text-sm text-slate-600 dark:text-slate-400">
                  {label}
                </label>
                <input
                  id={`ue-${key}`}
                  type="number"
                  step={step}
                  className={`${FIELD} w-28`}
                  value={plan.ue[key]}
                  onChange={e => edit(d => { d.ue[key] = Math.max(0, +e.target.value) || 0; })}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg bg-slate-900 p-5 text-white dark:bg-slate-950">
            <p className="text-3xl font-bold text-emerald-400">
              {calc.beMau !== null ? `${calc.beMau.toLocaleString('es-AR')} MAU` : 'No alcanza el margen'}
            </p>
            <p className="mt-1 text-sm text-slate-300">necesarios para llegar a EBITDA = 0</p>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-700 pt-4 md:grid-cols-3">
              {[
                { l: 'Ingreso / usuario / mes', v: fmt(calc.ingreso, plan.ueCurrency, 2), e: `≈ ${fmt(toBase(calc.ingreso, plan.ueCurrency, plan), base, 2)}` },
                { l: 'Costo variable / usuario', v: fmt(calc.costoVar, plan.ueCurrency, 2), e: `≈ ${fmt(toBase(calc.costoVar, plan.ueCurrency, plan), base, 2)}` },
                { l: 'Margen de contribución', v: fmt(calc.margen, plan.ueCurrency, 2), e: `≈ ${fmt(toBase(calc.margen, plan.ueCurrency, plan), base, 2)}` },
                { l: 'MAU actuales', v: plan.ue.mauActual.toLocaleString('es-AR'), e: '' },
                { l: 'Faltan (MAU)', v: calc.faltan === null ? '—' : calc.faltan.toLocaleString('es-AR'), e: '' },
                {
                  l: 'Estado',
                  v: calc.margen <= 0
                    ? 'Margen negativo'
                    : calc.faltan === 0
                      ? 'Equilibrio alcanzado'
                      : 'Por debajo del equilibrio',
                  e: '',
                },
              ].map(item => (
                <div key={item.l}>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{item.l}</p>
                  <p className="font-mono text-base font-semibold">{item.v}</p>
                  {item.e && <p className="font-mono text-xs text-emerald-400">{item.e}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 04 — Checklist */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num="04 · Decisión"
            title="Checklist Go / No-Go"
            description="Antes de pagar el primer trámite, marcá lo que ya está resuelto. Los tres primeros pesan más: son los riesgos que pueden convertir la inversión en capital quemado."
          />

          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {plan.checklist.map((item, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={item.on}
                  onChange={e => edit(d => { d.checklist[i].on = e.target.checked; })}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
                />
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">{item.t}</span>
                <span className="shrink-0 font-mono text-xs text-slate-400">{item.w}%</span>
              </label>
            ))}
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-900/50">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{calc.pct}%</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {calc.doneCount} / {plan.checklist.length} completado
              </span>
            </div>
            <div className="my-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full transition-all ${
                  calc.pct >= 80 ? 'bg-emerald-500' : calc.pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${calc.pct}%` }}
              />
            </div>
            <p
              className={`text-sm font-semibold ${
                calc.pct >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : calc.pct >= 50
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {calc.pct >= 80
                ? 'Listo para registrar la SAS.'
                : calc.pct >= 50
                  ? 'Cerca — resolvé lo pendiente antes de pagar el trámite.'
                  : 'Todavía no — validá más antes de registrar la sociedad.'}
            </p>
          </div>
        </section>

        {/* 05 — Cronograma */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num="05 · Cronograma"
            title="Hitos hacia Serie A"
            description="Fechas objetivo editables para cada hito. Actualizá el estado a medida que avanza."
          />

          <div className="ml-1 space-y-3 border-l-2 border-sky-500 pl-5">
            {plan.timeline.map((row, i) => {
              const tone =
                row.s === 'Cumplido' ? 'bg-emerald-500'
                : row.s === 'En curso' ? 'bg-amber-500'
                : 'bg-slate-300 dark:bg-slate-600';
              return (
                <div
                  key={i}
                  className="relative rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50"
                >
                  <span className={`absolute -left-[27px] top-5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${tone}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${INPUT} min-w-[180px] flex-1 font-semibold`}
                      value={row.h}
                      onChange={e => edit(d => { d.timeline[i].h = e.target.value; })}
                      aria-label="Hito"
                    />
                    <input
                      type="date"
                      className={`${FIELD} w-40 text-left`}
                      value={row.d}
                      onChange={e => edit(d => { d.timeline[i].d = e.target.value; })}
                      aria-label="Fecha objetivo"
                    />
                    <select
                      className={SELECT}
                      value={row.s}
                      onChange={e => edit(d => { d.timeline[i].s = e.target.value; })}
                      aria-label="Estado del hito"
                    >
                      {TIMELINE_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => edit(d => { d.timeline.splice(i, 1); })}
                      className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      aria-label="Eliminar hito"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => edit(d => { d.timeline.push({ h: 'Nuevo hito', d: '', s: 'Pendiente' }); })}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-sky-500 hover:text-sky-600 dark:border-slate-600 dark:text-slate-400"
          >
            <Plus className="h-4 w-4" /> Agregar hito
          </button>
        </section>

        <FinancialProjectionPanel
          assumptions={projectionAssumptions}
          actuals={actuals}
          arsToCurrency={toBase(1, 'ARS', plan) / (toBase(1, projectionCurrency, plan) || 1)}
          onEdit={mutate => edit(d => { mutate(d.projection as ProjectionAssumptions); })}
          currency={projectionCurrency}
          onCurrencyChange={c => edit(d => { d.projectionCurrency = c as Currency; })}
          fmt={fmtProjection}
        />

        <p className="pb-6 text-center text-xs text-slate-400">
          Los montos son orientativos y se guardan en la base de la plataforma. Confirmá los aranceles con un contador antes de pagar.
        </p>
      </div>
    </div>
  );
}
