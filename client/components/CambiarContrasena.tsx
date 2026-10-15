import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const entrada =
  "w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500";

/**
 * Configuración → Seguridad → contraseña.
 *
 * Tres casos:
 *  - la cuenta no tiene contraseña (se registró con Google/X): «Establecer contraseña»;
 *  - la tiene: «Cambiar contraseña» con la actual;
 *  - la tiene pero no la recuerda: «No recuerdo mi contraseña actual» → se le manda un código de 6 números al correo de la cuenta y
 *    con ese código elige una nueva (después se cierran todas las sesiones, y tiene que volver a entrar).
 */
export default function CambiarContrasena() {
  const { t } = useTranslation();
  const { token, logout } = useAuth() as any;
  const navigate = useNavigate();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [isOAuth, setIsOAuth] = useState(false);
  const [modo, setModo] = useState<"actual" | "codigo">("actual");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const salida = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cabeceras = (): Record<string, string> => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/has-password`, { credentials: "include", headers: cabeceras() });
        const data = await res.json();
        if (data.success) {
          setHasPassword(data.hasPassword);
          setIsOAuth(data.isOAuth);
        }
      } catch {
        /* sin respuesta no se muestra la sección */
      }
    })();
    return () => {
      if (salida.current) clearTimeout(salida.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const validarNueva = (): string | null => {
    if (newPassword.length < 6) return t("auth.passwordMinLength");
    if (newPassword !== confirmPassword) return t("settings.password.mismatch", "Las contraseñas no coinciden");
    return null;
  };

  const pedirPeticion = async (ruta: string, cuerpo?: Record<string, unknown>) => {
    const res = await fetch(`${API_URL}${ruta}`, { method: "POST", credentials: "include", headers: cabeceras(), body: JSON.stringify(cuerpo ?? {}) });
    return res.json();
  };

  const enviarCodigo = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const data = await pedirPeticion("/auth/password/send-code");
      if (data.success) {
        setCodigoEnviado(true);
        setMsg({ type: "success", text: data.message });
      } else {
        setMsg({ type: "error", text: data.message || "No pudimos enviar el código." });
      }
    } catch {
      setMsg({ type: "error", text: t("auth.connectionError") });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const problema = validarNueva();
    if (problema) {
      setMsg({ type: "error", text: problema });
      return;
    }
    if (modo === "codigo" && !/^\d{6}$/.test(codigo.trim())) {
      setMsg({ type: "error", text: "El código tiene 6 números: está en el correo que te enviamos." });
      return;
    }

    setLoading(true);
    try {
      const data =
        modo === "codigo"
          ? await pedirPeticion("/auth/password/change-with-code", { code: codigo.trim(), newPassword })
          : await pedirPeticion(hasPassword ? "/auth/change-password" : "/auth/set-password", hasPassword ? { currentPassword, newPassword } : { newPassword });

      if (data.success) {
        setMsg({ type: "success", text: data.message });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setCodigo("");
        setHasPassword(true);
        if (data.logout) {
          // Se cerraron todas las sesiones por seguridad: se vuelve a entrar con la contraseña nueva.
          salida.current = setTimeout(async () => {
            try { await logout?.(); } catch { /* igual se va al ingreso */ }
            navigate("/login", { replace: true });
          }, 2500);
        }
      } else {
        setMsg({ type: "error", text: data.message || "Error" });
      }
    } catch {
      setMsg({ type: "error", text: t("auth.connectionError") });
    } finally {
      setLoading(false);
    }
  };

  if (hasPassword === null) return null;

  const usaCodigo = hasPassword && modo === "codigo";

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {hasPassword ? t("settings.password.change", "Cambiar contraseña") : t("settings.password.set", "Establecer contraseña")}
      </h3>
      {!hasPassword && isOAuth && (
        <div className="mb-4 p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
          <p className="text-sm text-sky-800 dark:text-sky-300">{t("settings.password.oauthHint", "Te registraste con Google o X. Establecé una contraseña para poder entrar también con tu correo.")}</p>
        </div>
      )}
      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"}`}>
          {msg.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {hasPassword && !usaCodigo && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t("settings.password.current", "Contraseña actual")}</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className={entrada} autoComplete="current-password" />
            <button
              type="button"
              onClick={() => { setModo("codigo"); setMsg(null); }}
              className="mt-2 text-sm text-sky-700 dark:text-sky-400 underline underline-offset-2"
            >
              No recuerdo mi contraseña actual
            </button>
          </div>
        )}

        {usaCodigo && (
          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10 p-4 space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Te enviamos un código de 6 números al correo de tu cuenta. Con ese código elegís una contraseña nueva, sin necesitar la actual.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={enviarCodigo} disabled={loading} className="px-4 py-2 text-sm rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30 disabled:opacity-50">
                {codigoEnviado ? "Enviar un código nuevo" : "Enviarme el código por correo"}
              </button>
              <button type="button" onClick={() => { setModo("actual"); setMsg(null); setCodigoEnviado(false); setCodigo(""); }} className="text-sm text-slate-600 dark:text-slate-400 underline underline-offset-2">
                Recordé mi contraseña actual
              </button>
            </div>
            {codigoEnviado && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Código del correo</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  className={`${entrada} tracking-[0.4em] text-center font-mono max-w-[12rem]`}
                />
              </div>
            )}
          </div>
        )}

        {(!usaCodigo || codigoEnviado) && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t("settings.password.new", "Contraseña nueva")}</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className={entrada} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t("settings.password.confirm", "Repetí la contraseña nueva")}</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className={entrada} autoComplete="new-password" />
            </div>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
              {loading ? t("common.loading") : hasPassword ? t("settings.password.changeBtn", "Cambiar contraseña") : t("settings.password.setBtn", "Establecer contraseña")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
