import React, { useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MapPin, Clock, Calendar, ArrowRight } from "lucide-react";
import type { Job } from "@/types";

interface JobCardProps {
  job: Job;
  index?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Limpieza:      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Reparaciones:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Jardín:        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Mantenimiento: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Hogar:         "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  default:       "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const JobCardComponent: React.FC<JobCardProps> = ({ job, index = 0 }) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = React.useRef<HTMLButtonElement>(null);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  }, []);

  const formatTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }, []);

  const price = (job as any).budget ?? (job as any).price ?? 0;
  const categoryKey = (job as any).category as string | undefined;
  const categoryClass = categoryKey
    ? CATEGORY_COLORS[categoryKey] ?? CATEGORY_COLORS.default
    : CATEGORY_COLORS.default;

  return (
    <div
      className={cn("animate-fadeInUp")}
      style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
    >
      <button
        ref={cardRef}
        onClick={() => navigate(`/jobs/${(job as any)._id ?? job.id}`)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); cardRef.current?.style.setProperty('--spotlight-opacity', '0'); }}
        onMouseMove={(e) => {
          const el = cardRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          el.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
          el.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
          el.style.setProperty('--spotlight-opacity', '1');
        }}
        className={cn(
          "spotlight-card group relative w-full text-left rounded-2xl overflow-hidden",
          "bg-white dark:bg-slate-800/90",
          "border transition-all duration-300 ease-out",
          isHovered
            ? "border-sky-300/80 dark:border-sky-600/60 shadow-xl shadow-sky-100/60 dark:shadow-sky-900/30 -translate-y-1"
            : "border-slate-200/80 dark:border-slate-700/60 shadow-sm shadow-slate-200/40 dark:shadow-slate-900/30",
          "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
        )}
      >
        {/* Accent bar top */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-sky-500 via-blue-500 to-sky-400",
            "transition-opacity duration-300",
            isHovered ? "opacity-100" : "opacity-0",
          )}
        />

        <div className="p-5">
          {/* Header row: category + price */}
          <div className="flex items-start justify-between gap-3 mb-3">
            {categoryKey && (
              <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide", categoryClass)}>
                {categoryKey}
              </span>
            )}
            <div className="ml-auto shrink-0">
              <span className="inline-flex items-baseline gap-0.5 px-3 py-1 rounded-full bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/40 border border-sky-200/60 dark:border-sky-800/40">
                <span className="text-xs font-medium text-sky-600 dark:text-sky-400">$</span>
                <span className="text-base font-bold text-sky-700 dark:text-sky-300">
                  {price.toLocaleString("es-AR")}
                </span>
              </span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5 line-clamp-1 leading-snug">
            {job.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 leading-relaxed">
            {job.description}
          </p>

          {/* Footer: dates + cta */}
          <div className="flex items-center justify-between pt-3.5 border-t border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0 text-sky-500" aria-hidden="true" />
                <span>{formatDate(job.startDate)}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                <span>{formatTime(job.startDate)}</span>
              </span>
            </div>

            <span
              className={cn(
                "flex items-center gap-1 text-xs font-semibold transition-all duration-200",
                isHovered ? "text-sky-600 dark:text-sky-400 translate-x-0.5" : "text-slate-400 dark:text-slate-500",
              )}
              aria-hidden="true"
            >
              Ver
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </button>
    </div>
  );
};

export const JobCard = memo(JobCardComponent, (prev, next) =>
  prev.job._id === next.job._id &&
  prev.job.title === next.job.title &&
  (prev.job as any).budget === (next.job as any).budget &&
  prev.job.description === next.job.description &&
  prev.index === next.index
);

export default JobCard;
