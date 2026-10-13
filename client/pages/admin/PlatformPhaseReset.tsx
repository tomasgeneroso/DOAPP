import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const MINIMO = 8; // el mismo mínimo que exige el servidor (completeActionPasswordReset)

/**
 * Adonde lleva el enlace del correo «recuperar la contraseña de cambio de fase» (`/admin/platform/reset?token=…`).
 *
 * El servidor armaba ese enlace (`POST /api/admin/platform/phase-password/forgot`) y también tenía el pedido que lo
 * completa (`POST …/phase-password/reset`), pero la pantalla en el medio nunca existió: el enlace llevaba a un 404 y
 * nadie podía recuperar la contraseña que protege el cambio de fase (beta ↔ real, o sea cuándo se cobra comisión).
 *
 * El enlace sirve una sola vez y vence a los 30 minutos; eso lo decide el servidor. Acá solo se pide la contraseña nueva.
 */
export default function PlatformPhaseReset() {
  const { token: sesion } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) return setError("Falta el código del enlace. Abrí el enlace del correo completo o pedí uno nuevo.");
    if (clave.length < MINIMO) return setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
    if (clave !== repetida) return setError("Las dos contraseñas no coinciden.");
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/platform/phase-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion}` },
        body: JSON.stringify({ token, password: clave }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.success === true) setListo(true);
      else setError(data.message || "No se pudo cambiar la contraseña. Pedí un enlace nuevo.");
    } catch {
      setError("No se pudo conectar. Revisá tu conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    "w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent";

  return (
    <>
      <Helmet>
        <title>Recuperar contraseña de cambio de fase - DOAPP</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-md mx-auto p-4 sm:p-8">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-6 sm:p-8">
          {listo ? (
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Contraseña actualizada</h1>
              <p className="text-slate-600 dark:text-slate-300 mb-6">Ya podés usarla para cambiar la fase de la plataforma.</p>
              <Link to="/admin/platform" className="inline-block px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium">
                Ir al cambio de fase
              </Link>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-6 w-6 text-sky-600" />
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Nueva contraseña de cambio de fase</h1>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Es la contraseña que protege el paso de beta a real (cuándo se empieza a cobrar comisión). El enlace sirve una sola vez.
              </p>
              <div>
                <label htmlFor="clave" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Contraseña nueva</label>
                <input id="clave" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} className={campo} />
              </div>
              <div>
                <label htmlFor="repetida" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Repetila</label>
                <input id="repetida" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} className={campo} />
              </div>
              {!!error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={enviando}
                className="w-full px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar contraseña
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
