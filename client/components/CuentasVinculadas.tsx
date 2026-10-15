import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Transicion from "./ui/Transicion";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type Proveedor = "google" | "twitter";

const NOMBRE: Record<Proveedor, string> = { google: "Google", twitter: "X" };

const MENSAJES_DE_ERROR: Record<string, string> = {
  vencido: "El enlace venció o se abrió desde otro navegador. Probá de nuevo desde acá.",
  en_uso: "Esa cuenta ya está enlazada a otra cuenta de DOAPP. Si es tuya, entrá con ella.",
  otra_cuenta_vinculada: "Tu cuenta ya tiene otra cuenta de ese servicio enlazada.",
  sin_usuario: "No pudimos encontrar tu cuenta. Volvé a iniciar sesión.",
  servidor: "No pudimos enlazarla. Probá de nuevo en un momento.",
};

/**
 * Configuración → Seguridad → cuentas enlazadas.
 *
 * Quien se registró con correo y contraseña puede enlazar Google o X para entrar con un toque y, sobre todo, para que «Ingresar con
 * Google» abra ESTA cuenta en vez de crear otra. Con la sesión iniciada se pide el enlace al servidor; la persona pasa por el
 * proveedor y vuelve acá con el resultado en la dirección.
 */
export default function CuentasVinculadas() {
  const { token } = useAuth() as any;
  const [params, setParams] = useSearchParams();
  const [linked, setLinked] = useState<{ google: boolean; twitter: boolean } | null>(null);
  const [trabajando, setTrabajando] = useState<Proveedor | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const cabeceras = (): Record<string, string> => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

  const cargar = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/has-password`, { credentials: "include", headers: cabeceras() });
      const data = await res.json();
      if (data.success) setLinked({ google: !!data.linked?.google, twitter: !!data.linked?.twitter });
    } catch {
      /* sin respuesta no se muestra la sección */
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // El resultado vuelve en la dirección (?vinculado=google o ?vinculo_error=en_uso): se muestra y se limpia.
  useEffect(() => {
    const ok = params.get("vinculado");
    const error = params.get("vinculo_error");
    if (!ok && !error) return;
    if (ok === "google" || ok === "twitter") setMsg({ type: "success", text: `Listo: enlazaste ${NOMBRE[ok]} a tu cuenta.` });
    else if (error) setMsg({ type: "error", text: MENSAJES_DE_ERROR[error] || "No pudimos enlazar la cuenta." });
    const limpio = new URLSearchParams(params);
    limpio.delete("vinculado");
    limpio.delete("vinculo_error");
    setParams(limpio, { replace: true });
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const enlazar = async (proveedor: Proveedor) => {
    setMsg(null);
    setTrabajando(proveedor);
    try {
      const res = await fetch(`${API_URL}/auth/social/link-start`, { method: "POST", credentials: "include", headers: cabeceras(), body: JSON.stringify({ provider: proveedor }) });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setMsg({ type: "error", text: data.message || "No pudimos empezar el enlace." });
    } catch {
      setMsg({ type: "error", text: "Error de conexión. Probá de nuevo." });
    }
    setTrabajando(null);
  };

  if (!linked) return null;

  const fila = (proveedor: Proveedor) => (
    <li key={proveedor} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200">{proveedor === "google" ? "G" : "𝕏"}</span>
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{NOMBRE[proveedor]}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{linked[proveedor] ? "Enlazada a tu cuenta" : `Entrá con ${NOMBRE[proveedor]} sin escribir tu contraseña`}</p>
        </div>
      </div>
      {linked[proveedor] ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Enlazada</span>
      ) : (
        <button type="button" onClick={() => enlazar(proveedor)} disabled={trabajando !== null} className="inline-flex items-center gap-2 rounded-lg border border-sky-300 dark:border-sky-700 px-3 py-1.5 text-sm font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50">
          {trabajando === proveedor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Enlazar {NOMBRE[proveedor]}
        </button>
      )}
    </li>
  );

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Cuentas enlazadas</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Si te registraste con correo y contraseña, enlazá Google o X: así «Ingresar con Google» abre esta misma cuenta y no una nueva.
      </p>
      <Transicion mostrar={!!msg}>
        {msg && (
          <div role={msg.type === "error" ? "alert" : "status"} className={`mb-4 p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"}`}>{msg.text}</div>
        )}
      </Transicion>
      <ul className="space-y-2">{(["google", "twitter"] as Proveedor[]).map(fila)}</ul>
    </div>
  );
}
