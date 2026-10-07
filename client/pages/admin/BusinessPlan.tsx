import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import FinancialProjectionPanel from '@/components/admin/FinancialProjectionPanel';
import LiveFinancialsPanel from '@/components/admin/LiveFinancialsPanel';
import AyudaDePantalla from '@/components/admin/AyudaDePantalla';
import Concepto from '@/components/ui/Concepto';
import { SECCIONES_DEL_PLAN, ETAPAS_DEL_PLAN, N } from '@/content/seccionesDelPlan';
import { textoDelAviso } from '@/content/avisosDelPlan';
import { ROLES_DE_ANALISIS } from '../../../shared/auth/accesoAnalisis';
import {
  crearGuardador,
  motivoDeFallo,
  type Guardador,
  type EstadoDeGuardado,
} from '@/utils/guardadoAutomatico';
import { projectFinancials, type ProjectionAssumptions } from '@/utils/financialProjection';
import { calcularUnidad, mauDeEquilibrio, META_RUNWAY_FASE1_MESES } from '../../../shared/pricing/unidadEconomica';
import {
  aEuros,
  cambiarMonedaUe,
  editarImporteUe,
  sincronizarImportesUe,
  CAMPOS_IMPORTE_UE,
  type CampoImporteUe,
  type OrigenImportes,
} from '../../../shared/pricing/conversionMoneda';
import {
  coordinarPlan,
  cambiarMonedaDeLaProyeccion,
  MESES_DE_BETA_MAXIMOS,
} from '../../../shared/pricing/planCoordinado';
import {
  tipoDeGasto,
  totalesPorTipo,
  TIPOS_DE_GASTO,
  ROTULO_DE_TIPO,
  type TipoDeGasto,
} from '../../../shared/pricing/gastos';
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
interface BudgetRow { c: string; m: number; n: string; tipo?: TipoDeGasto }
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
  /** Gastos de la BETA. */
  budgetCurrency: Currency;
  budget: BudgetRow[];
  /** Cuántos meses dura la beta. */
  betaMeses: number;
  /** Gastos de la ETAPA REAL: nacen como copia de los de la beta. */
  budgetRealCurrency: Currency;
  budgetReal: BudgetRow[];
  checklist: CheckItem[];
  timeline: TimelineRow[];
  ueCurrency: Currency;
  ue: UnitEconomics;
  /**
   * El ticket, el soporte y los costos fijos tal como se escribieron, y en qué
   * moneda. Lo que se ve en `ue` es una derivación de esto. Ausente en los planes
   * guardados antes de que existiera; ver shared/pricing/conversionMoneda.ts.
   */
  ueOrigen?: OrigenImportes;
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

// La conversión vive en shared/pricing/conversionMoneda.ts: la usa también el
// cambio de moneda de la sección de unit economics, y ahí tiene tests.
const toEur = (amount: number, from: Currency, plan: Plan) => aEuros(amount, from, plan);

const eurToBase = (plan: Plan) => {
  if (plan.baseCurrency === 'EUR') return 1;
  if (plan.baseCurrency === 'ARS') return plan.rateArs || 1;
  return plan.rateUsd || 1;
};

const toBase = (amount: number, from: Currency, plan: Plan) =>
  toEur(amount, from, plan) * eurToBase(plan);

/**
 * Cuántos decimales mostrar para un importe por usuario.
 *
 * Con dos no alcanza cuando el importe es chico: un margen de 0,1256 dólares se
 * ve "US$0,13", y quien divide los costos fijos por ese 0,13 llega a un punto de
 * equilibrio distinto del que muestra la pantalla. Por debajo de 10 se muestran
 * cuatro.
 */
const decimalesDe = (n: number) => (Math.abs(n) < 10 ? 4 : 2);

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
  title: React.ReactNode;
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
          <p className="truncate text-xs text-slate-500 dark:text-slate-400"><Concepto c={label} /></p>
          <p className={`truncate text-xl font-bold tabular-nums ${text}`}>{value}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{sub}</p>
        </div>
        <Icon className={`h-5 w-5 shrink-0 ${text}`} />
      </div>
    </div>
  );
}

/** El rótulo de cada etapa del plan: el orden en que se piensa el negocio. */
function EtapaHeader({ etapa }: { etapa: keyof typeof ETAPAS_DEL_PLAN }) {
  const e = ETAPAS_DEL_PLAN[etapa];
  return (
    <div role="heading" aria-level={2} className="mb-3 mt-8 flex flex-wrap items-baseline gap-x-3 border-b-2 border-sky-500/40 pb-1.5">
      <span className="text-sm font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">{e.titulo}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{e.detalle}</span>
    </div>
  );
}

type ClaveDeGastos = 'budget' | 'budgetReal';
type ClaveDeMonedaDeGastos = 'budgetCurrency' | 'budgetRealCurrency';

/**
 * Una tabla de gastos mensuales. La de la beta y la de la etapa real son la misma
 * tabla con distintos datos: un solo componente evita que una se corrija y la otra no.
 *
 * Cada rubro lleva su TIPO, que decide qué hace el modelo con él (ver
 * shared/pricing/gastos.ts). Muestra el que se deduce del nombre y, si se lo cambia,
 * queda escrito: lo escrito manda sobre el nombre.
 */
function TablaDeGastos({
  plan,
  clave,
  claveMoneda,
  base,
  edit,
}: {
  plan: Plan;
  clave: ClaveDeGastos;
  claveMoneda: ClaveDeMonedaDeGastos;
  base: Currency;
  edit: (mutate: (draft: Plan) => void) => void;
}) {
  const filas = plan[clave];
  const moneda = plan[claveMoneda];
  const enBase = filas.map(r => toBase(r.m, moneda, plan));
  const totalBase = enBase.reduce((s, v) => s + v, 0);
  const totales = totalesPorTipo(filas);
  const th = 'px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className={th}>Rubro</th>
              <th className={th}><Concepto c="Tipo de gasto" /></th>
              <th className={th}>/ mes</th>
              <th className={th}>≈ {base}</th>
              <th className={th}>Notas</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {filas.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="w-1/3 px-1 py-1.5">
                  <input
                    className={INPUT}
                    value={row.c}
                    onChange={e => edit(d => { d[clave][i].c = e.target.value; })}
                    aria-label="Rubro"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <select
                    className={`${SELECT} w-full text-xs`}
                    value={tipoDeGasto(row)}
                    onChange={e => edit(d => { d[clave][i].tipo = e.target.value as TipoDeGasto; })}
                    aria-label="Tipo de gasto"
                  >
                    {TIPOS_DE_GASTO.map(t => (
                      <option key={t} value={t}>{ROTULO_DE_TIPO[t]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1.5">
                  <input
                    type="number"
                    className={NUM_INPUT}
                    value={row.m}
                    onChange={e => edit(d => { d[clave][i].m = Math.max(0, +e.target.value) || 0; })}
                    aria-label="Monto mensual"
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs text-sky-600 dark:text-sky-400">
                  {fmt(enBase[i], base)}
                </td>
                <td className="px-1 py-1.5">
                  <input
                    className={`${INPUT} text-xs text-slate-500 dark:text-slate-400`}
                    value={row.n}
                    placeholder="Notas…"
                    onChange={e => edit(d => { d[clave][i].n = e.target.value; })}
                    aria-label="Notas"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <button
                    onClick={() => edit(d => { d[clave].splice(i, 1); })}
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
              <td className="px-2 py-2 font-bold text-slate-900 dark:text-white"><Concepto c="Gasto mensual" /></td>
              <td />
              <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                {fmt(totales.total, moneda)}
              </td>
              <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                {fmt(totalBase, base)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {TIPOS_DE_GASTO.map(t => (
          <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-700/60">
            <Concepto c={ROTULO_DE_TIPO[t]} />:{' '}
            <strong className="font-mono text-slate-700 dark:text-slate-200">{fmt(totales[t], moneda)}</strong>
          </span>
        ))}
      </div>

      <button
        onClick={() => edit(d => { d[clave].push({ c: 'Nuevo rubro', m: 0, n: '' }); })}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-sky-500 hover:text-sky-600 dark:border-slate-600 dark:text-slate-400"
      >
        <Plus className="h-4 w-4" /> Agregar rubro
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

export default function BusinessPlan() {
  const { user } = useAuth();
  // Quién puede ver y editar el plan: el owner y el analista, que es el rol que
  // existe justamente para colaborar con estos números. Antes decía `=== 'owner'`
  // y el analista veía "Acceso restringido" en esta pantalla aunque el servidor lo
  // dejaba pasar: la mitad de lo que su rol debía mostrarle estaba cerrada.
  const puedeVerElPlan = (ROLES_DE_ANALISIS as readonly string[]).includes(user?.adminRole || '');

  const [plan, setPlan] = useState<Plan | null>(null);
  const [actuals, setActuals] = useState<Actuals | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({
    updatedAt: null,
    updatedBy: null,
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<EstadoDeGuardado>({ tipo: 'ocioso' });
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState('');
  // El plan que se está editando, siempre al día: de ahí sale cada cambio y lo que se guarda.
  const planRef = useRef<Plan | null>(null);

  /* ---- carga ---- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/business-plan', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        // Los bloques se coordinan al RECIBIR el plan, no sólo al editarlo: uno
        // guardado antes de que existiera la coordinación trae ticket y costos
        // fijos propios que no coinciden con los de las otras secciones.
        const recibido = data.data as Plan;
        coordinarPlan(recibido);
        planRef.current = recibido;
        setPlan(recibido);
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
    if (puedeVerElPlan) void load();
    else setLoading(false);
  }, [load, puedeVerElPlan]);

  /* ---- guardado automático ---- */

  /**
   * Manda el plan al servidor; rechaza con el MOTIVO si no se guardó.
   *
   * Lo gobierna `crearGuardador` (client/utils/guardadoAutomatico.ts), que
   * garantiza un solo pedido a la vez y siempre del valor más nuevo. Antes cada
   * cambio armaba su propio temporizador y los guardados podían pisarse: con el
   * servidor lento, el viejo llegaba después del nuevo y lo revertía.
   */
  const enviarPlan = useCallback(async (siguiente: Plan, { alSalir }: { alSalir: boolean }) => {
    let res: Response;
    try {
      res = await fetch('/api/admin/business-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ data: siguiente }),
        // Al cerrar o recargar, el pedido tiene que sobrevivir a la página.
        keepalive: alSalir,
      });
    } catch {
      throw new Error('sin conexión con el servidor');
    }
    // Si no vino JSON, contestó algo DELANTE de la aplicación (Cloudflare, nginx).
    const esJson = (res.headers.get('content-type') || '').includes('json');
    const data = esJson ? await res.json().catch(() => null) : null;
    if (!res.ok || !data?.success) throw new Error(motivoDeFallo(res.status, data?.message, esJson));
    setMeta(m => ({ ...m, updatedAt: data.updatedAt }));
  }, []);

  const guardador = useRef<Guardador<Plan> | null>(null);
  if (guardador.current === null) {
    guardador.current = crearGuardador<Plan>({ enviar: enviarPlan, alCambiar: setSaveState });
  }

  /** Toda edición pasa por acá: actualiza el estado y deja el cambio pendiente de guardar */
  const edit = useCallback((mutate: (draft: Plan) => void) => {
    const anterior = planRef.current;
    if (!anterior) return;
    const siguiente: Plan = JSON.parse(JSON.stringify(anterior));
    mutate(siguiente);
    // Lo que se ve de la unidad económica sale siempre de su origen. Acá, y no
    // en cada lugar que toca las tasas, para que un cambio de cotización —a
    // mano o con "Traer"— se refleje sin que nadie tenga que acordarse.
    sincronizarImportesUe(siguiente);
    // Y los bloques entre sí: lo que viene de otra sección se recalcula con cada
    // cambio (shared/pricing/planCoordinado.ts), para que no haya dos versiones.
    coordinarPlan(siguiente);
    planRef.current = siguiente;
    setPlan(siguiente);
    guardador.current!.programar(siguiente);
  }, []);

  // Lo que se tipeó justo antes de salir no se pierde: al ocultarse la página
  // (cerrar, recargar, cambiar de pestaña) y al pasar a otra pantalla de la app,
  // se envía ya, sin esperar. Y si queda algo sin guardar, el navegador avisa.
  useEffect(() => {
    const g = guardador.current!;
    const salir = () => { void g.vaciar({ alSalir: true }); };
    const alOcultar = () => { if (document.visibilityState === 'hidden') salir(); };
    const avisar = (e: BeforeUnloadEvent) => {
      if (g.hayCambiosSinGuardar()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('pagehide', salir);
    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('beforeunload', avisar);
    return () => {
      window.removeEventListener('pagehide', salir);
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('beforeunload', avisar);
      void g.vaciar();
    };
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

    /**
     * La cuenta sale de shared/pricing/unidadEconomica.ts, no de acá.
     *
     * Estaba escrita en este archivo y otra vez en el servicio de métricas, y
     * las dos versiones no coincidían: aquélla sumaba `disputas` y `fraude`
     * como importes cuando acá siempre fueron porcentajes del volumen. Dos
     * pantallas mostrando la misma cuenta con resultados distintos es como
     * terminó la tabla de comisiones diciendo 8/3/1.
     */
    const ue = plan.ue;
    const unidad = calcularUnidad({
      ticket: ue.ticket,
      contratos: ue.contratos,
      comisionPct: ue.comision,
      soporte: ue.soporte,
      disputasPct: ue.disputas,
      fraudePct: ue.fraude,
    });
    // Los tres, SIN redondear. Se muestran con los decimales que haga falta
    // (ver `decimalesDe`) y el equilibrio se calcula con el margen exacto: dividir
    // por el redondeado a centavos daba 138.462 en dólares donde en pesos daba
    // 143.312. Con un margen de 0,1256, redondearlo a 0,13 es un 3,5% de error en
    // el denominador, y el resultado dependía de la moneda con que se mirara.
    const ingreso = unidad.exacto.ingreso;
    const costoVar = unidad.exacto.costo;
    const margen = unidad.exacto.margen;
    const beMau = mauDeEquilibrio(ue.fijos, margen);
    const faltan = beMau === null ? null : Math.max(0, beMau - ue.mauActual);

    // De dónde sale cada número de la proyección, y qué queda al terminar la beta.
    // La proyección se corre acá también (la del panel es la misma cuenta) porque
    // "capital al terminar la beta" se muestra en la sección de gastos de la beta.
    const derivados = coordinarPlan(JSON.parse(JSON.stringify(plan)) as Plan);
    const monedaProy = plan.projectionCurrency || 'USD';
    const cajaInicial = restanteBase / (toBase(1, monedaProy, plan) || 1);
    const cajaAlTerminarLaBeta = projectFinancials({ ...plan.projection, cajaInicial }).resumen.cajaAlTerminarLaBeta;
    const cajaAlTerminarLaBetaBase =
      cajaAlTerminarLaBeta === null ? null : toBase(cajaAlTerminarLaBeta, monedaProy, plan);

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
      derivados,
      cajaAlTerminarLaBetaBase,
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
  // a un admin que no es owner ni analista.
  if (!puedeVerElPlan) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className={`${CARD} max-w-md p-8 text-center`}>
          <Lock className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Acceso restringido</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            La proyección de gastos sólo está disponible para el owner y los analistas de la plataforma.
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
  const runwayCorto = calc.runway > 0 && calc.runway < META_RUNWAY_FASE1_MESES;

  // Honesto: "sin guardar" desde el instante del cambio y no recién cuando sale el
  // pedido; antes seguía diciendo "Guardado" en verde durante ese lapso, y quien
  // recargaba ahí perdía el cambio sin saber que había algo pendiente.
  const saveLabel =
    saveState.tipo === 'pendiente' ? 'Cambios sin guardar…'
    : saveState.tipo === 'guardando' ? 'Guardando…'
    : saveState.tipo === 'error' ? `No se pudo guardar: ${saveState.motivo}`
    : saveState.tipo === 'guardado' ? 'Guardado'
    : meta.updatedAt ? `Editado ${new Date(meta.updatedAt).toLocaleString('es-AR')}` : 'Sin cambios';
  const sinGuardar = saveState.tipo === 'pendiente' || saveState.tipo === 'guardando';

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
              Cuánto cuesta la beta, cuánto la etapa real y qué pasa a 1, 3, 5 y 10 años. Cada número se carga una sola vez, en
              su sección: los demás bloques lo toman de ahí. Visible para el owner y los analistas.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  sinGuardar ? 'bg-amber-500'
                  : saveState.tipo === 'error' ? 'bg-rose-500'
                  : 'bg-emerald-500'
                }`}
              />
              {saveLabel}
              {meta.updatedBy && !sinGuardar && saveState.tipo !== 'error' && ` · por ${meta.updatedBy}`}
              {saveState.tipo === 'error' && (
                <button onClick={() => void guardador.current?.reintentar()} className="ml-1 underline hover:text-sky-500">
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

        <AyudaDePantalla pantalla="proyeccion" />

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
            sub={runwayCorto ? `meta: ${META_RUNWAY_FASE1_MESES} meses` : 'de operación'}
            tone={calc.runway >= META_RUNWAY_FASE1_MESES ? 'emerald' : runwayCorto ? 'amber' : 'rose'}
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

        <EtapaHeader etapa="antes" />

        {/* 01 — Constitución */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num={SECCIONES_DEL_PLAN.tramite}
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
                <Concepto c="Capital inicial aportado" />
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

        <EtapaHeader etapa="beta" />

        {/* 02 — Gastos de la beta */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num={SECCIONES_DEL_PLAN.gastosBeta}
            title="Gastos de la beta"
            description="Lo que se gasta por mes mientras no se cobra comisión: lanzamiento en un solo barrio, antes de escalar. Cada rubro tiene un tipo —fijo, publicidad o soporte— que decide cómo lo usa el modelo."
            right={
              <CurrencyPicker
                label="Moneda de la tabla"
                value={plan.budgetCurrency}
                onChange={c => edit(d => { d.budgetCurrency = c; })}
              />
            }
          />

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
            <label htmlFor="beta-meses" className="text-sm text-slate-600 dark:text-slate-400">
              <Concepto c="Duración de la beta" />
            </label>
            <input
              id="beta-meses"
              type="number"
              min={0}
              max={MESES_DE_BETA_MAXIMOS}
              className={`${FIELD} w-20`}
              value={plan.betaMeses}
              onChange={e => edit(d => { d.betaMeses = Math.min(MESES_DE_BETA_MAXIMOS, Math.max(0, Math.round(+e.target.value) || 0)); })}
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              meses · comisión durante la beta: <strong className="text-slate-700 dark:text-slate-200">0%</strong>
            </span>
          </div>

          <TablaDeGastos plan={plan} clave="budget" claveMoneda="budgetCurrency" base={base} edit={edit} />

          <div className="mt-4 rounded-lg bg-slate-900 p-5 text-white dark:bg-slate-950">
            <p className={`text-3xl font-bold ${calc.cajaAlTerminarLaBetaBase !== null && calc.cajaAlTerminarLaBetaBase < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {calc.cajaAlTerminarLaBetaBase === null ? '—' : fmt(calc.cajaAlTerminarLaBetaBase, base)}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              <Concepto c="Capital al terminar la beta" />
              {calc.cajaAlTerminarLaBetaBase === null
                ? ' — no hay beta: cargá su duración arriba'
                : ` — después de ${plan.betaMeses} ${plan.betaMeses === 1 ? 'mes' : 'meses'} de beta, con impuestos`}
            </p>
            {calc.cajaAlTerminarLaBetaBase !== null && calc.cajaAlTerminarLaBetaBase < 0 && (
              <p className="mt-2 text-sm text-rose-300">El capital no alcanza para sostener la beta: faltan {fmt(Math.abs(calc.cajaAlTerminarLaBetaBase), base)}.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-700 pt-4 md:grid-cols-4">
              {[
                { l: 'Gasto mensual', v: fmt(calc.totBudgetBase, base) },
                { l: 'Runway Fase 1', v: calc.runway > 0 ? `${calc.runway.toFixed(1)} meses` : '—', e: `meta: ${META_RUNWAY_FASE1_MESES} meses` },
                { l: 'Capital restante', v: fmt(calc.restanteBase, base), e: 'tras constituir' },
                { l: 'Altas por mes (publicidad ÷ CAC)', v: Math.round(calc.derivados.beta.altasPorMes).toLocaleString('es-AR'), e: `con ${fmtProjection(calc.derivados.beta.pauta)} de publicidad` },
              ].map(item => (
                <div key={item.l}>
                  <p className="text-xs uppercase tracking-wide text-slate-400"><Concepto c={item.l} /></p>
                  <p className="font-mono text-base font-semibold">{item.v}</p>
                  {item.e && <p className="font-mono text-xs text-emerald-400">{item.e}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <EtapaHeader etapa="real" />

        {/* 03 — Gastos de la etapa real */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num={SECCIONES_DEL_PLAN.gastosReal}
            title="Gastos de la etapa real"
            description="Lo que se gasta por mes desde que se cobra comisión. Arrancó como copia de los de la beta: ajustalo a lo que esperás gastar. De acá salen los costos fijos y las altas de usuarios de la proyección; no se cargan en ningún otro lado."
            right={
              <CurrencyPicker
                label="Moneda de la tabla"
                value={plan.budgetRealCurrency}
                onChange={c => edit(d => { d.budgetRealCurrency = c; })}
              />
            }
          />

          <TablaDeGastos plan={plan} clave="budgetReal" claveMoneda="budgetRealCurrency" base={base} edit={edit} />

          <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-900/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Lo que el modelo toma de esta tabla, por mes
            </p>
            <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400"><Concepto c="Costos fijos de la etapa real" /></dt>
                <dd className="font-mono text-base font-semibold text-slate-900 dark:text-white">{fmtProjection(calc.derivados.real.fijos)}</dd>
                <dd className="text-xs text-slate-400">sólo los rubros de tipo Fijo</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400"><Concepto c="Altas por mes (publicidad ÷ CAC)" /></dt>
                <dd className="font-mono text-base font-semibold text-slate-900 dark:text-white">
                  {Math.round(calc.derivados.real.altasPorMes).toLocaleString('es-AR')}
                </dd>
                <dd className="text-xs text-slate-400">{fmtProjection(calc.derivados.real.pauta)} de publicidad ÷ CAC de {fmtProjection(plan.projection.costs.cac)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400"><Concepto c="Soporte y disputas" /></dt>
                <dd className="font-mono text-base font-semibold text-slate-900 dark:text-white">por usuario</dd>
                <dd className="text-xs text-slate-400">se calcula en la sección {N.unitEconomics}, no se suma acá</dd>
              </div>
            </dl>
          </div>

          {calc.derivados.avisos.length > 0 && (
            <ul className="mt-3 space-y-2">
              {calc.derivados.avisos.map(a => (
                <li
                  key={a.codigo}
                  className="flex items-start gap-2 rounded border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{textoDelAviso(a, fmtProjection)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 04 — Unit economics */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num={SECCIONES_DEL_PLAN.unitEconomics}
            title={<Concepto c="Punto de equilibrio" />}
            description="Cuántos usuarios activos por mes hacen falta para cubrir los costos fijos de la etapa real. Los costos fijos no se cargan acá: vienen de los gastos de la etapa real. Podés traer los demás supuestos desde los datos reales de la plataforma."
            right={
              <CurrencyPicker
                label="Moneda de la sección"
                value={plan.ueCurrency}
                // Cualquier moneda a cualquier otra, siempre al valor equivalente.
                // Se recuerda cada importe tal como se escribió y se deriva desde
                // ahí, así que no depende del camino ni acumula error. Antes sólo
                // cambiaba la etiqueta y "US$21" pasaba a "$21": un ticket de
                // veintiún pesos. Ver shared/pricing/conversionMoneda.ts.
                onChange={c => edit(d => cambiarMonedaUe(d, c))}
              />
            }
          />

          {actuals && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  edit(d => {
                    d.ue.mauActual = actuals.mau;
                    d.ue.contratos = actuals.contratosPorUsuario || d.ue.contratos;
                    if (actuals.comisionPromedio > 0) d.ue.comision = actuals.comisionPromedio;
                    // Los reales vienen en pesos: se registran EN PESOS como origen,
                    // no convertidos a la moneda de la sección. Al ver la sección en
                    // pesos aparece el número real, no una ida y vuelta por dólares.
                    if (actuals.ticketPromedio > 0) {
                      editarImporteUe(d, 'ticket', actuals.ticketPromedio, 'ARS');
                    }
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
              >
                <Database className="h-3.5 w-3.5" /> Usar datos reales
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
            {([
              ['Comisión promedio (%)', 'comision', 0.1],
              ['Ticket promedio por contrato', 'ticket', 1],
              ['Contratos por usuario activo / mes', 'contratos', 0.1],
              ['Costo de disputas (% del volumen)', 'disputas', 0.1],
              ['Costo de soporte por usuario / mes', 'soporte', 0.05],
              ['Costos fijos mensuales (de la etapa real)', 'fijos', 1],
              ['Fraude / chargebacks (% del volumen)', 'fraude', 0.1],
              ['Usuarios activos actuales (MAU)', 'mauActual', 1],
            ] as [string, keyof UnitEconomics, number][]).map(([label, key, step]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 dark:border-slate-700/50"
              >
                <label htmlFor={`ue-${key}`} className="flex-1 text-sm text-slate-600 dark:text-slate-400">
                  <Concepto c={label} />
                </label>
                {key === 'fijos' ? (
                  // No es una entrada: son los rubros fijos de la etapa real. Un campo
                  // editable acá volvía a abrir el hueco de cargar lo mismo dos veces.
                  <div id={`ue-${key}`} className="w-28 text-right">
                    <p className="font-mono text-sm tabular-nums text-slate-900 dark:text-white">
                      {fmt(plan.ue.fijos, plan.ueCurrency)}
                    </p>
                    <p className="text-[10px] leading-tight text-slate-400">viene de {SECCIONES_DEL_PLAN.gastosReal}</p>
                  </div>
                ) : (
                  <input
                    id={`ue-${key}`}
                    type="number"
                    step={step}
                    className={`${FIELD} w-28`}
                    value={plan.ue[key]}
                    onChange={e => edit(d => {
                      const valor = Math.max(0, +e.target.value) || 0;
                      // Los importes registran en qué moneda se escribieron; los
                      // porcentajes y las cantidades no tienen moneda.
                      if ((CAMPOS_IMPORTE_UE as readonly string[]).includes(key)) {
                        editarImporteUe(d, key as CampoImporteUe, valor);
                      } else {
                        d.ue[key] = valor;
                      }
                    })}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg bg-slate-900 p-5 text-white dark:bg-slate-950">
            <p className="text-3xl font-bold text-emerald-400">
              {calc.beMau !== null ? <>{calc.beMau.toLocaleString('es-AR')} <Concepto c="MAU" /></> : 'No alcanza el margen'}
            </p>
            <p className="mt-1 text-sm text-slate-300">necesarios para llegar a EBITDA = 0</p>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-700 pt-4 md:grid-cols-3">
              {[
                { l: 'Ingreso / usuario / mes', v: fmt(calc.ingreso, plan.ueCurrency, decimalesDe(calc.ingreso)), e: `≈ ${fmt(toBase(calc.ingreso, plan.ueCurrency, plan), base, decimalesDe(toBase(calc.ingreso, plan.ueCurrency, plan)))}` },
                { l: 'Costo variable / usuario', v: fmt(calc.costoVar, plan.ueCurrency, decimalesDe(calc.costoVar)), e: `≈ ${fmt(toBase(calc.costoVar, plan.ueCurrency, plan), base, decimalesDe(toBase(calc.costoVar, plan.ueCurrency, plan)))}` },
                { l: 'Margen de contribución', v: fmt(calc.margen, plan.ueCurrency, decimalesDe(calc.margen)), e: `≈ ${fmt(toBase(calc.margen, plan.ueCurrency, plan), base, decimalesDe(toBase(calc.margen, plan.ueCurrency, plan)))}` },
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
                  <p className="text-xs uppercase tracking-wide text-slate-400"><Concepto c={item.l} /></p>
                  <p className="font-mono text-base font-semibold">{item.v}</p>
                  {item.e && <p className="font-mono text-xs text-emerald-400">{item.e}</p>}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Es el mínimo para que el margen cubra los costos fijos. No incluye la publicidad ni reponer a los usuarios que se
              van: eso lo suma la proyección ({SECCIONES_DEL_PLAN.supuestos}).
            </p>
          </div>
        </section>

        <EtapaHeader etapa="proyeccion" />

        <FinancialProjectionPanel
          assumptions={projectionAssumptions}
          actuals={actuals}

          onEdit={mutate => edit(d => { mutate(d.projection as ProjectionAssumptions); })}
          currency={projectionCurrency}
          onCurrencyChange={c => edit(d => cambiarMonedaDeLaProyeccion(d, c as Currency))}
          fmt={fmtProjection}
        />

        <EtapaHeader etapa="seguimiento" />

        {/* 04 — Checklist */}
        <section className={`${CARD} mb-6 p-5`}>
          <SectionHeader
            num={SECCIONES_DEL_PLAN.decision}
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
            num={SECCIONES_DEL_PLAN.cronograma}
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

        {/* La proyección es "si pasa X"; esto es lo que está pasando.
            Van separadas a propósito: un número supuesto y uno medido se ven
            igual en pantalla, y conviene que no se confundan. */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <LiveFinancialsPanel />
        </section>

        <p className="pb-6 text-center text-xs text-slate-400">
          Los montos son orientativos y se guardan en la base de la plataforma. Confirmá los aranceles con un contador antes de pagar.
        </p>
      </div>
    </div>
  );
}
