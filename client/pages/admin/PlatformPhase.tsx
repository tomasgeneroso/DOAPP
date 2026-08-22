import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { Rocket, ShieldCheck, Loader2, AlertTriangle, KeyRound, Mail } from "lucide-react";

interface PhaseInfo {
  phase: "beta" | "live";
  isBeta: boolean;
  betaEndsAt: string;
  betaDaysLeft: number;
  passwordSet: boolean;
}

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/platform/phase", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setInfo(d.data);
    } finally {
      setLoading(false);
    }
  }, [token]);

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

  const endsAt = new Date(info.betaEndsAt).toLocaleDateString("es-AR", {
    day: "numeric", month: "long", year: "numeric",
  });

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
                  ? "La app no cobra comision. Un contrato de $36.000 le cuesta $36.000 al cliente y el trabajador recibe $36.000. Todos los usuarios tienen SUPER PRO."
                  : "Se cobran las comisiones segun el plan de cada usuario (8% / 3% / 1%, minimo $1.000) y las suscripciones son pagas."}
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

        {msg && (
          <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </>
  );
}
