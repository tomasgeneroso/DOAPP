import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Sparkles, TrendingUp, Wallet, Users, Receipt, Info, AlertTriangle, ArrowUpRight,
  ArrowDownRight, Crown, Loader2, Landmark, Save, CalendarClock, BarChart3,
} from "lucide-react";

interface Analytics {
  year: number;
  currency: string;
  facturacionTotal: number;
  facturacionAnual: number;
  facturacionAnualPrevia: number;
  comisionesTotal: number;
  totalTrabajos: number;
  totalTrabajosAnual: number;
  ticketPromedio: number;
  ticketPromedioCliente: number;
  clientesUnicos: number;
  clientesRecurrentes: number;
  tasaRecompra: number;
  pipelineActivo: number;
  proyeccionAnual: number;
  annualLimit: number | null;
  fiscalCondition: string | null;
  monotributoCategory: string | null;
  evolucionMensual: { month: string; label: string; total: number; count: number }[];
  desgloseTrimestral: { quarter: string; total: number; count: number }[];
  topClientes: { clientId: string; name: string; total: number; count: number }[];
  alertas: { type: string; severity: "info" | "warning" | "danger"; message: string }[];
  facturas: { id: string; fecha: string; cliente: string; trabajo: string; monto: number; comision: number; currency: string }[];
}

const ars = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);

/** Educational info popover — plain-language help for non-savvy users */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="text-slate-400 hover:text-sky-500 transition-colors"
        aria-label="Más información"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 rounded-lg bg-slate-900 text-white text-xs leading-relaxed p-3 shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

function KpiCard({ icon, label, value, help, trend }: {
  icon: React.ReactNode; label: string; value: string; help: string;
  trend?: { dir: "up" | "down"; text: string };
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
          {icon}
          {label}
        </div>
        <InfoTip text={help} />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {trend && (
        <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
          trend.dir === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}>
          {trend.dir === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {trend.text}
        </p>
      )}
    </div>
  );
}

function ObligacionInfo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <h4 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{title}</h4>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}

/** "Impuestos y Obligaciones" tab — fiscal config + plain-language obligations guide */
function TaxTab({ data, onSaved }: { data: Analytics; onSaved: (d: Partial<Analytics>) => void }) {
  const { t } = useTranslation();
  const [condition, setCondition] = useState(data.fiscalCondition || "");
  const [category, setCategory] = useState(data.monotributoCategory || "");
  const [limit, setLimit] = useState(data.annualLimit ? String(data.annualLimit) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/membership/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          fiscalCondition: condition || null,
          monotributoCategory: category || null,
          monotributoAnnualLimit: limit ? Number(limit) : null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        onSaved({ fiscalCondition: json.data.fiscalCondition, monotributoCategory: json.data.monotributoCategory, annualLimit: json.data.monotributoAnnualLimit });
        setTimeout(() => setSaved(false), 2500);
      }
    } finally { setSaving(false); }
  };

  const limitPct = data.annualLimit ? Math.round((data.facturacionAnual / data.annualLimit) * 100) : null;
  const inputCls = "block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800";

  return (
    <div className="space-y-6">
      {/* Fiscal config */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <Landmark className="h-5 w-5 text-indigo-500" />
          {t("finance.yourFiscalSituation", "Tu situación fiscal")}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("finance.fiscalIntro", "Contanos cómo facturás para mostrarte tu tope y avisarte antes de que te pases. Lo podés cambiar cuando quieras.")}
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="text-sm">
            <span className="block text-slate-600 dark:text-slate-400 mb-1.5">{t("finance.fiscalCondition", "Condición fiscal")}</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
              <option value="">{t("finance.unspecified", "Sin especificar")}</option>
              <option value="monotributo">Monotributo</option>
              <option value="responsable_inscripto">{t("finance.responsableInscripto", "Responsable Inscripto")}</option>
              <option value="particular">{t("finance.particular", "Particular")}</option>
            </select>
          </label>
          {condition === "monotributo" && (
            <>
              <label className="text-sm">
                <span className="block text-slate-600 dark:text-slate-400 mb-1.5">{t("finance.category", "Categoría")}</span>
                <input value={category} onChange={(e) => setCategory(e.target.value.toUpperCase().slice(0, 2))} placeholder="A, B, C..." className={inputCls} />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 dark:text-slate-400 mb-1.5">{t("finance.annualCap", "Tope anual (ARS)")}</span>
                <input type="number" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Ej: 6450000" className={inputCls} />
              </label>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? t("finance.saved", "Guardado ✓") : t("common.save", "Guardar")}
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {t("finance.capHelp", "Tu tope anual lo encontrás en AFIP, en tu categoría de monotributo. Si no lo sabés, preguntale a tu contador.")}
        </p>
      </div>

      {/* Cap progress */}
      {limitPct !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">{t("finance.monotributoLimit", "Tope anual de monotributo")}</h3>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{limitPct}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${limitPct >= 100 ? "bg-red-500" : limitPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, limitPct)}%` }} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{ars(data.facturacionAnual)} {t("finance.of", "de")} {ars(data.annualLimit!)}</p>
        </div>
      )}

      {/* Obligations guide (educational) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <CalendarClock className="h-5 w-5 text-indigo-500" />
          {t("finance.obligationsTitle", "Tus obligaciones, en simple")}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t("finance.obligationsIntro", "Una guía rápida para que no te tome por sorpresa.")}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <ObligacionInfo title={t("finance.obWhatIsTitle", "¿Qué es el monotributo?")}>
            {t("finance.obWhatIs", "Es un régimen simplificado para pagar tus impuestos como trabajador independiente. Pagás una cuota fija por mes según tu categoría, y con eso cubrís impuestos y aportes.")}
          </ObligacionInfo>
          <ObligacionInfo title={t("finance.obRecatTitle", "Recategorización (cada 6 meses)")}>
            {t("finance.obRecat", "En enero y julio, AFIP mira lo que facturaste en los últimos 12 meses. Si facturaste más, te toca una categoría más alta (cuota más cara). Por eso te mostramos cuánto llevás del tope.")}
          </ObligacionInfo>
          <ObligacionInfo title={t("finance.obIibbTitle", "Ingresos Brutos (IIBB)")}>
            {t("finance.obIibb", "Es un impuesto provincial. Según tu provincia, quizás tengas que inscribirte y declararlo aparte del monotributo.")}
          </ObligacionInfo>
          <ObligacionInfo title={t("finance.obDueTitle", "Vencimientos")}>
            {t("finance.obDue", "La cuota de monotributo vence todos los meses (en general alrededor del día 20). Pagarla a tiempo te evita recargos y mantener tu categoría al día.")}
          </ObligacionInfo>
        </div>
      </div>
    </div>
  );
}

export default function FinancePanel() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState<"finanzas" | "impuestos">("finanzas");

  const isSuperPro = user?.membershipTier === "super_pro";

  useEffect(() => {
    if (!isSuperPro) { setLoading(false); setForbidden(true); return; }
    (async () => {
      try {
        const res = await fetch("/api/membership/analytics", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (res.status === 403) { setForbidden(true); return; }
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperPro]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  // Upsell for non-SUPER PRO users
  if (forbidden || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 mb-5">
          <Crown className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {t("finance.exclusiveTitle", "Centro Profesional — exclusivo SUPER PRO")}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          {t("finance.exclusiveDesc", "Llevá tu actividad como un profesional: facturación, impuestos, clientes y proyecciones, explicados en simple.")}
        </p>
        <Link to="/settings?tab=membership" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 transition-all">
          <Sparkles className="h-5 w-5" />
          {t("finance.upgrade", "Pasarme a SUPER PRO")}
        </Link>
      </div>
    );
  }

  const diffYoY = data.facturacionAnualPrevia > 0
    ? Math.round(((data.facturacionAnual - data.facturacionAnualPrevia) / data.facturacionAnualPrevia) * 100)
    : null;
  const limitPct = data.annualLimit ? Math.round((data.facturacionAnual / data.annualLimit) * 100) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="rounded-2xl p-6 mb-6 text-white bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-6 w-6 text-yellow-300" />
          <h1 className="text-2xl font-bold">{t("finance.title", "Centro Profesional · Finanzas")}</h1>
          <span className="text-xs bg-yellow-400 text-purple-900 px-2 py-0.5 rounded-full font-bold">SUPER PRO</span>
        </div>
        <p className="text-white/80 text-sm">
          {t("finance.subtitle", "Tu actividad del año {{year}} en números, explicada en simple.", { year: data.year })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1.5">
        {([["finanzas", t("finance.tabFinances", "Finanzas"), BarChart3], ["impuestos", t("finance.tabTaxes", "Impuestos y Obligaciones"), Landmark]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as "finanzas" | "impuestos")}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
              tab === id ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "finanzas" && (
        <>
      {/* Alerts */}
      {data.alertas.length > 0 && (
        <div className="space-y-2 mb-6">
          {data.alertas.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
              a.severity === "danger" ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
              : a.severity === "warning" ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              : "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300"}`}>
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("finance.billedThisYear", "Facturado este año")}
          value={ars(data.facturacionAnual)}
          help={t("finance.billedHelp", "Cuánto facturaste este año completando trabajos. Te sirve para saber cuánto ganaste y si te acercás al tope de tu categoría de monotributo.")}
          trend={diffYoY !== null ? { dir: diffYoY >= 0 ? "up" : "down", text: `${diffYoY >= 0 ? "+" : ""}${diffYoY}% vs ${data.year - 1}` } : undefined}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("finance.projection", "Proyección de cierre")}
          value={ars(data.proyeccionAnual)}
          help={t("finance.projectionHelp", "Estimación de cuánto vas a facturar al cierre del año si seguís al ritmo actual.")}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label={t("finance.avgTicket", "Ticket promedio")}
          value={ars(data.ticketPromedio)}
          help={t("finance.avgTicketHelp", "Lo que cobrás en promedio por trabajo. Para ganar más podés subir el precio o tomar más trabajos.")}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("finance.pipeline", "En curso (a cobrar)")}
          value={ars(data.pipelineActivo)}
          help={t("finance.pipelineHelp", "Plata de trabajos que ya tenés en marcha pero todavía no cobraste.")}
        />
      </div>

      {/* Monotributo limit progress */}
      {limitPct !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              {t("finance.monotributoLimit", "Tope anual de monotributo")}
              <InfoTip text={t("finance.monotributoHelp", "El monotributo tiene un límite de facturación por año según tu categoría. Si lo superás, tenés que recategorizarte. Esto es orientativo: confirmá tu categoría con tu contador.")} />
            </h3>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{limitPct}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${limitPct >= 100 ? "bg-red-500" : limitPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, limitPct)}%` }} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {ars(data.facturacionAnual)} {t("finance.of", "de")} {ars(data.annualLimit!)}
          </p>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Monthly evolution */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            {t("finance.monthlyEvolution", "Evolución mensual")}
            <InfoTip text={t("finance.monthlyHelp", "Cuánto facturaste cada mes en el último año. Te ayuda a ver tus mejores y peores meses (estacionalidad).")} />
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.evolucionMensual}>
              <defs>
                <linearGradient id="fillRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => ars(Number(v))} labelClassName="text-slate-900" />
              <Area type="monotone" dataKey="total" stroke="#a855f7" strokeWidth={2} fill="url(#fillRev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quarterly */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            {t("finance.quarterly", "Por trimestre")}
            <InfoTip text={t("finance.quarterlyHelp", "Cuánto facturaste en cada trimestre del año. Útil para organizar tus declaraciones.")} />
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.desgloseTrimestral}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="quarter" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => ars(Number(v))} />
              <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clients + invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top clients */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-slate-400" />
            {t("finance.topClients", "Top clientes")}
            <InfoTip text={t("finance.topClientsHelp", "Tus clientes que más te facturaron este año. Si uno solo concentra mucho, conviene diversificar para no depender de él.")} />
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {t("finance.recurrence", "Recompra")}: <span className="font-semibold">{Math.round(data.tasaRecompra * 100)}%</span> · {data.clientesUnicos} {t("finance.clients", "clientes")}
          </p>
          <div className="space-y-3">
            {data.topClientes.length === 0 && (
              <p className="text-sm text-slate-400">{t("finance.noClients", "Todavía no tenés clientes este año.")}</p>
            )}
            {data.topClientes.map((c) => {
              const pct = data.facturacionAnual > 0 ? Math.round((c.total / data.facturacionAnual) * 100) : 0;
              return (
                <div key={c.clientId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{c.name}</span>
                    <span className="text-slate-500 dark:text-slate-400">{ars(c.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invoices table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-slate-400" />
            {t("finance.invoices", "Detalle de trabajos facturados")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 font-medium">{t("finance.date", "Fecha")}</th>
                  <th className="py-2 font-medium">{t("finance.client", "Cliente")}</th>
                  <th className="py-2 font-medium hidden sm:table-cell">{t("finance.job", "Trabajo")}</th>
                  <th className="py-2 font-medium text-right">{t("finance.amount", "Monto")}</th>
                </tr>
              </thead>
              <tbody>
                {data.facturas.slice(0, 12).map((f) => (
                  <tr key={f.id} className="border-b border-slate-50 dark:border-slate-700/50">
                    <td className="py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(f.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="py-2 text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{f.cliente}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400 truncate max-w-[160px] hidden sm:table-cell">{f.trabajo}</td>
                    <td className="py-2 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">{ars(f.monto)}</td>
                  </tr>
                ))}
                {data.facturas.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">{t("finance.noInvoices", "Todavía no tenés trabajos facturados.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

        </>
      )}

      {tab === "impuestos" && (
        <TaxTab data={data} onSaved={(d) => setData((p) => (p ? { ...p, ...d } : p))} />
      )}

      {/* Disclaimer */}
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        {t("finance.disclaimer", "Esta información es orientativa y no constituye asesoramiento contable ni fiscal. Ante cualquier duda sobre tus obligaciones (monotributo, recategorización, IIBB), consultá con tu contador.")}
      </p>
    </div>
  );
}
