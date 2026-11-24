import { useState } from "react";
import { BookOpen, ChevronDown, Loader2, Pencil } from "lucide-react";
import Transicion from "../ui/Transicion";

const LARGO_MAXIMO = 500;

/**
 * La biografía se escribe y se muestra desde el perfil, en una sección que se despliega (pedido del dueño, 2026-11-24: «la biografía se debe
 * configurar y mostrarse desde el perfil, debe ser desplegable»). Antes se escribía en Configuración y salía siempre abierta.
 *
 * En el perfil de otra persona solo aparece si escribió algo. En el propio aparece siempre, para poder escribirla.
 */
export default function BiografiaDelPerfil({
  bio,
  esPropio,
  token,
  alGuardar,
}: {
  bio?: string | null;
  esPropio: boolean;
  token?: string | null;
  alGuardar: (bio: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const escrita = (bio || "").trim();
  if (!esPropio && !escrita) return null;

  const empezarAEditar = () => {
    setTexto(bio || "");
    setError(null);
    setEditando(true);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ bio: texto.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || "No se pudo guardar tu biografía.");
      alGuardar(texto.trim());
      setEditando(false);
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar tu biografía.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mb-3 max-w-2xl rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60" data-testid="biografia-del-perfil">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        data-guia="perfil-bio"
        data-testid="biografia-desplegar"
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/60"
      >
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Biografía
          {esPropio && !escrita && <span className="text-xs font-normal text-slate-500 dark:text-slate-400">· contá quién sos</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <Transicion mostrar={abierta}>
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          {editando ? (
            <div className="space-y-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                maxLength={LARGO_MAXIMO}
                placeholder="Escribí una biografía corta con tu experiencia. Así las personas te conocen antes de contratarte."
                data-testid="biografia-texto"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">{texto.length}/{LARGO_MAXIMO} caracteres</p>
              {error && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={guardar}
                  disabled={guardando}
                  data-testid="biografia-guardar"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  disabled={guardando}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {escrita ? (
                <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300" data-testid="biografia-contenido">{escrita}</p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no escribiste tu biografía. Con una biografía corta, tu perfil genera más confianza.</p>
              )}
              {esPropio && (
                <button
                  type="button"
                  onClick={empezarAEditar}
                  data-testid="biografia-editar"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {escrita ? "Editar biografía" : "Escribir biografía"}
                </button>
              )}
            </>
          )}
        </div>
      </Transicion>
    </div>
  );
}
