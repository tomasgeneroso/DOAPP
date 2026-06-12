import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from "lucide-react";

interface GuideStep {
  id: string;
  label: string;
  description: string;
  link?: string;
  linkLabel?: string;
  check: (user: any, location: string) => boolean;
}

const STEPS: GuideStep[] = [
  {
    id: "profile",
    label: "Completa tu perfil",
    description: "Agrega foto, bio y datos de contacto para generar confianza.",
    link: "/settings",
    linkLabel: "Ir a configuración",
    check: (user) => !!(user?.avatar && user?.bio),
  },
  {
    id: "browse",
    label: "Explorá trabajos disponibles",
    description: "Buscá publicaciones que se ajusten a tus habilidades.",
    link: "/",
    linkLabel: "Ver trabajos",
    check: (_user, loc) => loc !== "/" || false, // marks done after first visit to /
  },
  {
    id: "apply",
    label: "Enviá tu primera propuesta",
    description: "Postúlate a un trabajo o creá tu primera publicación.",
    link: "/",
    linkLabel: "Empezar",
    check: (user) => (user?.completedJobs ?? 0) > 0 || false,
  },
  {
    id: "contract",
    label: "Completá tu primer contrato",
    description: "¡Cerrá tu primer trabajo y empezá a construir tu reputación!",
    check: (user) => (user?.completedJobs ?? 0) > 0,
  },
];

const STORAGE_KEY = "fcg_dismissed";
const BROWSE_VISITED_KEY = "fcg_browse_visited";

export default function FirstContractGuide() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Mark "browse" step as visited
  useEffect(() => {
    if (location.pathname === "/") {
      localStorage.setItem(BROWSE_VISITED_KEY, "1");
    }
  }, [location.pathname]);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (!isAuthenticated || !user) return null;

  // Don't show if user has completed first contract
  if ((user.completedJobs ?? 0) > 0) return null;

  if (dismissed) return null;

  const browseVisited = localStorage.getItem(BROWSE_VISITED_KEY) === "1";

  const stepStatus = STEPS.map((step) => {
    if (step.id === "browse") return browseVisited;
    return step.check(user, location.pathname);
  });

  const completedCount = stepStatus.filter(Boolean).length;
  const progress = Math.round((completedCount / STEPS.length) * 100);

  // Auto-dismiss once all done (should be covered by completedJobs check above, safety net)
  if (completedCount === STEPS.length) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-sky-500 to-indigo-500 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold text-sm">Tu guía de inicio</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-xs font-medium">
            {completedCount}/{STEPS.length}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-white" />
          ) : (
            <ChevronUp className="h-4 w-4 text-white" />
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {STEPS.map((step, i) => {
            const done = stepStatus[i];
            return (
              <div key={step.id} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      done
                        ? "line-through text-slate-400 dark:text-slate-500"
                        : "text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {step.label}
                  </p>
                  {!done && (
                    <>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {step.description}
                      </p>
                      {step.link && (
                        <Link
                          to={step.link}
                          className="inline-block mt-1 text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium"
                        >
                          {step.linkLabel} →
                        </Link>
                      )}
                    </>
                  )}
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
        <div
          className="px-4 py-2 cursor-pointer"
          onClick={() => setExpanded(true)}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {completedCount === 0
              ? "Seguí estos pasos para tu primer contrato"
              : `${STEPS.length - completedCount} pasos restantes`}
          </p>
        </div>
      )}
    </div>
  );
}
