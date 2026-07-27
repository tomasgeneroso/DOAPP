import { ShieldCheck, Check, Lock } from "lucide-react";

export interface CredibilityInfo {
  score: number;
  max: number;
  isProfessional: boolean;
  breakdown: Array<{ level: number; label: string; achieved: boolean }>;
}

const TIER = [
  { min: 0, label: "Sin verificar", color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-700/50", ring: "text-slate-300 dark:text-slate-600" },
  { min: 1, label: "Básica", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", ring: "text-amber-500" },
  { min: 2, label: "Confiable", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/20", ring: "text-sky-500" },
  { min: 3, label: "Profesional", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20", ring: "text-emerald-500" },
  { min: 4, label: "Profesional +", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20", ring: "text-emerald-600" },
];

function tierFor(score: number) {
  return TIER[Math.max(0, Math.min(TIER.length - 1, score))];
}

/**
 * Credibility ladder badge. `variant="compact"` = small pill (for cards/headers);
 * `variant="full"` = pill + the level checklist (for the profile / settings).
 */
export default function CredibilityBadge({
  credibility,
  variant = "compact",
}: {
  credibility?: CredibilityInfo | null;
  variant?: "compact" | "full";
}) {
  if (!credibility) return null;
  const { score, max, breakdown } = credibility;
  const tier = tierFor(score);

  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tier.bg} ${tier.color}`}
      title={`Credibilidad ${score} de ${max}`}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Credibilidad {score}/{max}
      <span className="opacity-70">· {tier.label}</span>
    </span>
  );

  if (variant === "compact") return pill;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${tier.color}`} />
          <span className="font-semibold text-slate-900 dark:text-white">Credibilidad del perfil</span>
        </div>
        <span className={`text-sm font-bold ${tier.color}`}>{score}/{max} · {tier.label}</span>
      </div>

      {/* progress bar */}
      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-500 transition-all"
          style={{ width: `${max ? (score / max) * 100 : 0}%` }}
        />
      </div>

      {/* checklist */}
      <ul className="space-y-2">
        {breakdown.map((b) => (
          <li key={b.level} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                b.achieved
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400"
              }`}
            >
              {b.achieved ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            </span>
            <span className={b.achieved ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}>
              {b.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
