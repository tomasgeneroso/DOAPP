import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { CheckCircle, Circle, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { useGuiaPasoAPaso } from "./guias/GuiaPasoAPaso";
import { GUIAS, ORDEN_DE_GUIAS, guiaHecha, type IdDeGuia } from "./guias/guias";

/**
 * «Tu guía de inicio»: por ahora solo dos caminos (pedido del dueño, 2026-11-15): publicar un trabajo y conocer el menú de la cuenta. Cada uno abre una guía paso a paso
 * (components/guias): marca con un aro el lugar exacto y la persona toca el botón de verdad, con ayuda.
 */
const DESCRIPCION: Record<IdDeGuia, { texto: string; boton: string }> = {
  publicar: { texto: "Te mostramos el camino para publicar tu trabajo, paso a paso.", boton: "Mostrame el camino" },
  menu: { texto: "Tu perfil, tus trabajos y la configuración, a un toque de distancia.", boton: "Mostrame el menú" },
};

const STORAGE_KEY = "fcg_dismissed";

export default function FirstContractGuide() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const { iniciar, guiaActiva, version } = useGuiaPasoAPaso();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false; // sin acceso al almacenamiento (modo privado): la guía se muestra
    }
  });

  if (!isAuthenticated || !user) return null;

  // En el panel de administración la guía de inicio no corresponde (y tapaba la esquina de las pantallas de trabajo).
  if (location.pathname.startsWith("/admin")) return null;

  // Quien ya completó un contrato no la necesita.
  if ((user.completedJobs ?? 0) > 0) return null;

  if (dismissed) return null;

  // `version` cambia al terminar una guía: así se redibuja con el paso marcado.
  void version;
  const hechas = ORDEN_DE_GUIAS.map((id) => guiaHecha(user.id, id));
  const completedCount = hechas.filter(Boolean).length;
  const total = ORDEN_DE_GUIAS.length;
  const progress = Math.round((completedCount / total) * 100);

  // Con las dos guías vistas, la lista se va sola.
  if (completedCount === total) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* sin almacenamiento: se cierra por esta visita */
    }
    setDismissed(true);
  };

  const empezar = (id: IdDeGuia) => {
    setExpanded(false);
    iniciar(id);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-testid="guia-de-inicio">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-sky-500 to-indigo-500 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold text-sm">{t("firstContract.startGuide", "Tu guía de inicio")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-xs font-medium">
            {completedCount}/{total}
          </span>
          {expanded ? <ChevronDown className="h-4 w-4 text-white" /> : <ChevronUp className="h-4 w-4 text-white" />}
          {/* Cerrar sin tener que desplegar la guía */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="rounded p-0.5 text-white/80 hover:bg-white/20 hover:text-white"
            aria-label="Cerrar la guía de inicio"
            title="Cerrar la guía"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700">
        <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Caminos */}
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {ORDEN_DE_GUIAS.map((id, i) => {
            const done = hechas[i];
            return (
              <div key={id} className="flex items-start gap-3" data-testid={`guia-${id}`}>
                <div className="mt-0.5 shrink-0">
                  {done ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"}`}>{GUIAS[id].titulo}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{DESCRIPCION[id].texto}</p>
                  <button
                    type="button"
                    onClick={() => empezar(id)}
                    disabled={guiaActiva === id}
                    className="mt-1.5 rounded-lg bg-sky-500 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                    data-testid={`empezar-guia-${id}`}
                  >
                    {done ? "Verlo de nuevo" : DESCRIPCION[id].boton}
                  </button>
                </div>
              </div>
            );
          })}

          <button
            onClick={handleDismiss}
            className="w-full mt-1 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors py-1"
          >
            <X className="h-3 w-3" />
            Cerrar guía
          </button>
        </div>
      )}

      {/* Collapsed summary */}
      {!expanded && (
        <div className="px-4 py-2 cursor-pointer" onClick={() => setExpanded(true)}>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {completedCount === 0 ? "Te acompañamos paso a paso" : `${total - completedCount} ${total - completedCount === 1 ? "camino por recorrer" : "caminos por recorrer"}`}
          </p>
        </div>
      )}
    </div>
  );
}
