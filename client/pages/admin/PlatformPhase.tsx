import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { Rocket, ShieldCheck, Loader2, AlertTriangle, KeyRound, Mail, CalendarClock, Percent } from "lucide-react";
import { formatBetaEnd } from "@/hooks/usePlatformPhase";

interface PhaseInfo {
  phase: "beta" | "live";
  isBeta: boolean;
  betaEndsAt: string;
  liveStartsAt?: string;
  fechasPorDefecto?: boolean;
  betaDaysLeft: number;
  passwordSet: boolean;
}

interface Fiscal {
  tasaProcesamiento: number | null;
  iibbRetencion: number | null;
  iibbPropia: number | null;
  actualizadoEn?: string | null;
  vigente: { tasaProcesamiento: number; iibbRetencion: number; iibbPropia: number };
  origen: Record<"tasaProcesamiento" | "iibbRetencion" | "iibbPropia", "panel" | "entorno" | "defecto">;
}

/** Una fracción (0.0419) mostrada como porcentaje legible (4,19 %). */
const comoPct = (n: number) => `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 3 })} %`;

/** Para <input type="datetime-local">, que quiere hora local sin zona. */
const aLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Owner control for the beta/live switch.
 *
 * Leaving beta turns commission on for every contract created afterwards, so
 * this states the consequence in money before asking for the password, instead
 * of presenting a bare toggle behind a confirm dialog.
 */
export default function PlatformPhase() {
  const { token } = useAuth();
  const [info, setInfo] = useState<PhaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [formFiscal, setFormFiscal] = useState({ tasaProcesamiento: "", iibbRetencion: "", iibbPropia: "" });
  const [formFechas, setFormFechas] = useState({ betaEndsAt: "", liveStartsAt: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rFase, rFiscal] = await Promise.all([
        fetch("/api/admin/platform/phase", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/platform/fiscal", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const d = await rFase.json();
      if (d.success) {
        setInfo(d.data);
        setFormFechas({
          betaEndsAt: aLocalInput(d.data.betaEndsAt),
          liveStartsAt: aLocalInput(d.data.liveStartsAt || d.data.betaEndsAt),
        });
      }
      const f = await rFiscal.json().catch(() => ({ success: false }));
      if (f.success) {
        setFiscal(f.data);
        // Los campos arrancan con lo que hay guardado en el panel, no con lo
        // vigente: si está vacío es porque rige el .env, y mostrar ese número
        // como si fuera del panel haría que al guardar se "fije" sin querer.
        setFormFiscal({
          tasaProcesamiento: f.data.tasaProcesamiento ?? "",
          iibbRetencion: f.data.iibbRetencion ?? "",
          iibbPropia: f.data.iibbPropia ?? "",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  const guardarFiscal = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const r = await fetch("/api/admin/platform/fiscal", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tasaProcesamiento: num(formFiscal.tasaProcesamiento),
          iibbRetencion: num(formFiscal.iibbRetencion),
          iibbPropia: num(formFiscal.iibbPropia),
        }),
      });
      const d = await r.json();
      setMsg({ kind: d.success ? "ok" : "err", text: d.message || (d.success ? "Tasas actualizadas" : "No se pudo guardar") });
      if (d.success) await load();
    } catch {
      setMsg({ kind: "err", text: "Error de conexión." });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  const post = async (path: string, body: any, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/platform/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setMsg({ kind: d.success ? "ok" : "err", text: d.message || (d.success ? okText : "No se pudo completar") });
      if (d.success) {
        setPassword("");
        setNewPassword("");
        await load();
      }
    } catch {
      setMsg({ kind: "err", text: "Error de conexion." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  }
  if (!info) return <div className="p-8 text-slate-500">No se pudo cargar la fase.</div>;

  const endsAt = formatBetaEnd(info.betaEndsAt);

  return (
    <>
      <Helmet><title>Fase de la plataforma - Admin</title></Helmet>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fase de la plataforma</h1>

        <div className={`rounded-2xl border p-5 ${info.isBeta
          ? "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10"
          : "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/10"}`}>
          <div className="flex items-start gap-3">
            {info.isBeta
              ? <Rocket className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              : <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />}
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {info.isBeta ? "Fase beta" : "Fase real"}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {info.isBeta
                  ? "La app no cobra comisión. En un trabajo de $36.000 el cliente paga el precio más el costo de procesamiento del pago, y el trabajador recibe $36.000. Todos los usuarios tienen SUPER PRO."
                  : "Se cobra la comisión vigente sobre el precio del trabajo, a cargo del cliente, y las suscripciones son pagas. El trabajador sigue recibiendo el precio completo."}
              </p>
              {info.isBeta && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                  La beta termina el <strong>{endsAt}</strong> — faltan {info.betaDaysLeft} dias.
                  A partir de esa fecha se cobran comisiones aunque no toques nada aca.
                </p>
              )}
            </div>
          </div>
        </div>

        {!info.passwordSet ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-sky-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Crea la contrasena de cambio de fase</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Se pide una sola vez. Es distinta de la de tu cuenta, porque esa la escribis todos los dias
              y suele quedar guardada en el navegador. Despues podes recuperarla por correo.
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimo 8 caracteres"
              autoComplete="new-password"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
            <button
              onClick={() => post("phase-password", { password: newPassword }, "Contrasena guardada")}
              disabled={busy || newPassword.length < 8}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
            >
              {busy ? "Guardando..." : "Guardar contrasena"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {info.isBeta ? "Pasar a fase real" : "Volver a fase beta"}
            </h2>

            {info.isBeta && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  A partir del cambio, cada contrato nuevo lleva comision y las suscripciones se cobran.
                  Los contratos que ya existen no cambian: cada uno guardo su comision al crearse.
                </p>
              </div>
            )}

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contrasena de cambio de fase"
              autoComplete="off"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => post("phase", { phase: info.isBeta ? "live" : "beta", password }, "Fase actualizada")}
                disabled={busy || !password}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
              >
                {busy ? "Aplicando..." : info.isBeta ? "Activar fase real" : "Volver a beta"}
              </button>
              <button
                onClick={() => post("phase-password/forgot", {}, "Te enviamos un enlace")}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Mail className="h-4 w-4" /> Olvide la contrasena
              </button>
            </div>
          </div>
        )}

        {/*
          Las fechas. Van con la misma contraseña que el cambio de fase porque
          moverlas cambia cuándo empieza a cobrarse comisión: adelantarlas cobra
          antes de lo anunciado, atrasarlas regala comisión.
        */}
        {info.passwordSet && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-sky-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Fechas de las fases</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Cuándo termina la beta y cuándo arranca la fase real. Pueden ser el mismo momento
              (el cambio es inmediato) o dejar un hueco para avisar antes: durante ese hueco la
              comisión sigue en cero. Pasada la fecha de inicio de la fase real, la comisión se
              activa sola aunque nadie toque el botón de arriba.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="block mb-1 text-slate-700 dark:text-slate-300">Termina la beta</span>
                <input
                  type="datetime-local"
                  value={formFechas.betaEndsAt}
                  onChange={(e) => setFormFechas((f) => ({ ...f, betaEndsAt: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </label>
              <label className="text-sm">
                <span className="block mb-1 text-slate-700 dark:text-slate-300">Empieza la fase real</span>
                <input
                  type="datetime-local"
                  value={formFechas.liveStartsAt}
                  onChange={(e) => setFormFechas((f) => ({ ...f, liveStartsAt: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña de cambio de fase"
              autoComplete="off"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
            <button
              onClick={() =>
                post(
                  "phase-dates",
                  {
                    betaEndsAt: formFechas.betaEndsAt ? new Date(formFechas.betaEndsAt).toISOString() : null,
                    liveStartsAt: formFechas.liveStartsAt ? new Date(formFechas.liveStartsAt).toISOString() : null,
                    password,
                  },
                  "Fechas actualizadas",
                )
              }
              disabled={busy || !password || !formFechas.betaEndsAt}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
            >
              {busy ? "Guardando..." : "Guardar fechas"}
            </button>
            {info.fechasPorDefecto && (
              <p className="text-xs text-slate-500">Ahora mismo rigen las fechas de fábrica.</p>
            )}
          </div>
        )}

        {/*
          Tasas e impuestos. No piden contraseña: no encienden la comisión ni
          cambian lo ya cobrado, y el contador puede necesitar corregirlos el
          mismo día que los recibe. Quedan auditados igual.
        */}
        {fiscal && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-sky-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Tasas e impuestos</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Se escriben como <strong>fracción</strong>: 0.0419 es 4,19 %. Dejar un campo vacío
              significa "usar lo que diga el servidor" (la variable de entorno), que es la forma de
              deshacer un cambio sin tener que acordarse del valor anterior.
            </p>

            {([
              {
                k: "tasaProcesamiento" as const,
                titulo: "Costo de procesamiento del pago",
                ayuda: "Lo que se le cobra al cliente por pasar el pago, sin IVA. Tiene que ser la tarifa MÁS ALTA que cobra Mercado Pago entre los medios habilitados (hoy, tarjeta de crédito). Si es menor, DOAPP paga la diferencia en cada operación con crédito.",
              },
              {
                k: "iibbRetencion" as const,
                titulo: "Retención de IIBB",
                ayuda: "Lo que Mercado Pago retiene sobre cada acreditación, según el padrón. No es un costo: es pago a cuenta del impuesto propio. Sin inscripción suele ser 0.03.",
              },
              {
                k: "iibbPropia" as const,
                titulo: "Alícuota propia de IIBB",
                ayuda: "El impuesto real sobre el ingreso de DOAPP (la comisión). Lo da el contador según la jurisdicción y la actividad; para intermediación suele ser más alta que para servicios generales.",
              },
            ]).map((campo) => (
              <div key={campo.k} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className="text-sm font-medium text-slate-800 dark:text-slate-200" htmlFor={campo.k}>
                    {campo.titulo}
                  </label>
                  <span className="text-xs text-slate-500">
                    Rige ahora: <strong className="tabular-nums">{comoPct(fiscal.vigente[campo.k])}</strong>{" "}
                    <span className="opacity-70">
                      ({fiscal.origen[campo.k] === "panel" ? "de este panel" : fiscal.origen[campo.k] === "entorno" ? "del .env del servidor" : "valor por defecto"})
                    </span>
                  </span>
                </div>
                <input
                  id={campo.k}
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  value={formFiscal[campo.k]}
                  onChange={(e) => setFormFiscal((f) => ({ ...f, [campo.k]: e.target.value }))}
                  placeholder={`vacío = usar ${fiscal.origen[campo.k] === "panel" ? "el .env" : "el valor actual"}`}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white tabular-nums"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">{campo.ayuda}</p>
              </div>
            ))}

            <button
              onClick={guardarFiscal}
              disabled={busy}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
            >
              {busy ? "Guardando..." : "Guardar tasas"}
            </button>
            {fiscal.actualizadoEn && (
              <p className="text-xs text-slate-500">
                Última edición desde el panel: {new Date(fiscal.actualizadoEn).toLocaleString("es-AR")}
              </p>
            )}
          </div>
        )}

        {msg && (
          <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </>
  );
}
