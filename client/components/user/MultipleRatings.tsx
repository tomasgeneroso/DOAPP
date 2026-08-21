import { User, RoleRatingStats } from "../../types";
import {
  Star,
  Clock,
  UserCheck,
  DollarSign,
  Wrench,
  Heart,
  MapPin,
  Briefcase,
  Handshake,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DimensionKey,
  dimensionsForRole,
  ReviewedRole,
} from "./reviewDimensions";

interface MultipleRatingsProps {
  user: User;
  showAll?: boolean;
}

const toNum = (v: any): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

/**
 * Estilo y textos de cada dimensión, indexados por la clave que usa el
 * backend. `legacyKey` es el campo plano del usuario, para los perfiles
 * que todavía no tienen el desglose por rol calculado.
 */
const DIMENSION_UI: Record<
  DimensionKey,
  {
    legacyKey: keyof User;
    labelKey: string;
    labelDefault: string;
    descKey: string;
    descDefault: string;
    icon: typeof Clock;
    color: string;
    bg: string;
    border: string;
  }
> = {
  timeliness: {
    legacyKey: "puntualidadRating",
    labelKey: "profile.ratings.dimTimeliness",
    labelDefault: "Puntualidad",
    descKey: "profile.ratings.dimTimelinessDesc",
    descDefault: "¿Llegó a la hora acordada?",
    icon: Clock,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-100 dark:border-blue-800",
  },
  attendance: {
    legacyKey: "presencialidadRating",
    labelKey: "profile.ratings.dimAttendance",
    labelDefault: "Presencialidad",
    descKey: "profile.ratings.dimAttendanceDesc",
    descDefault: "¿Se presentó? ¿No dejó plantado al cliente?",
    icon: MapPin,
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-100 dark:border-orange-800",
  },
  communication: {
    legacyKey: "comoPersonaRating",
    labelKey: "profile.ratings.dimAsPerson",
    labelDefault: "Como persona",
    descKey: "profile.ratings.dimAsPersonDesc",
    descDefault: "Trato, actitud y respeto durante el trabajo",
    icon: Heart,
    color: "text-pink-500",
    bg: "bg-pink-50 dark:bg-pink-900/20",
    border: "border-pink-100 dark:border-pink-800",
  },
  fairPrice: {
    legacyKey: "precioJustoRating",
    labelKey: "profile.ratings.dimFairPrice",
    labelDefault: "Precio justo",
    descKey: "profile.ratings.dimFairPriceDesc",
    descDefault: "Se respetó lo acordado, sin cargos sorpresa",
    icon: DollarSign,
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-100 dark:border-green-800",
  },
  quality: {
    legacyKey: "calidadTrabajoRating",
    labelKey: "profile.ratings.dimQuality",
    labelDefault: "Calidad de trabajo",
    descKey: "profile.ratings.dimQualityDesc",
    descDefault: "Resultado final: ¿quedó bien hecho?",
    icon: Star,
    color: "text-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    border: "border-yellow-100 dark:border-yellow-800",
  },
  professionalism: {
    legacyKey: "profesionalidadRating",
    labelKey: "profile.ratings.dimProfessionalism",
    labelDefault: "Profesionalidad",
    descKey: "profile.ratings.dimProfessionalismDesc",
    descDefault: "Herramientas ordenadas, presencia limpia, trabajo prolijo",
    icon: Wrench,
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-900/20",
    border: "border-violet-100 dark:border-violet-800",
  },
};

function Stars({ value, color }: { value: number; color: string }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${s <= rounded ? `${color} fill-current` : "text-gray-200 dark:text-gray-600"}`}
        />
      ))}
    </div>
  );
}

/**
 * Una dimensión con su promedio y sobre cuántas opiniones se calculó.
 * Sin opiniones se muestra "Sin datos": no es lo mismo que puntuar bajo.
 */
function DimensionRow({
  dimension,
  value,
  count,
}: {
  dimension: DimensionKey;
  value: number;
  count?: number;
}) {
  const { t } = useTranslation();
  const ui = DIMENSION_UI[dimension];
  const Icon = ui.icon;
  const rated = value > 0 && (count === undefined || count > 0);

  return (
    <div
      className={`flex items-center justify-between ${ui.bg} border ${ui.border} rounded-lg px-3 py-2.5 group relative ${!rated && "opacity-50"}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-4 h-4 ${ui.color} shrink-0`} />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help">
          {t(ui.labelKey, ui.labelDefault)}
        </span>
        {/* Tooltip */}
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none">
          <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 rotate-45" />
          {t(ui.descKey, ui.descDefault)}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rated ? (
          <>
            <Stars value={value} color={ui.color} />
            <span className="text-sm font-bold text-gray-800 dark:text-gray-100 w-8 text-right">
              {value.toFixed(1)}
            </span>
            {count !== undefined && (
              <span className="text-xs text-gray-400 w-10 text-right">
                {t("profile.ratings.overCount", "({{n}})", { n: count })}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400">
            {t("profile.ratings.noData", "Sin datos")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Reputación de un rol, con las dimensiones que se puntúan en ese rol */
function RoleSection({
  role,
  stats,
  showAll,
}: {
  role: ReviewedRole;
  stats: RoleRatingStats;
  showAll: boolean;
}) {
  const { t } = useTranslation();
  const Icon = role === "doer" ? Briefcase : Handshake;
  const accent = role === "doer" ? "text-sky-500" : "text-emerald-500";

  const dimensions = dimensionsForRole(role)
    .map((d) => d.key)
    .filter((key) => showAll || toNum(stats.dimensions?.[key]?.avg) > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-4 h-4 ${accent}`} />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {role === "doer"
              ? t("profile.ratings.asDoer", "Como trabajador")
              : t("profile.ratings.asClient", "Como cliente")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Stars value={stats.rating} color={accent} />
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
            {stats.rating.toFixed(1)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("profile.ratings.count", { count: stats.count })}
          </span>
        </div>
      </div>

      {dimensions.map((key) => (
        <DimensionRow
          key={`${role}-${key}`}
          dimension={key}
          value={toNum(stats.dimensions?.[key]?.avg)}
          count={stats.dimensions?.[key]?.count ?? 0}
        />
      ))}
    </div>
  );
}

/**
 * Reputación del usuario. Cuando hay opiniones de los dos papeles se
 * muestran por separado: al trabajador se lo puntúa en las seis dimensiones
 * y al cliente sólo en las que le aplican, así que promediarlas juntas
 * compararía cosas distintas.
 */
export default function MultipleRatings({
  user,
  showAll = true,
}: MultipleRatingsProps) {
  const { t } = useTranslation();
  const hasReviews = toNum(user.reviewsCount) > 0;

  const breakdown = user.ratingBreakdown;
  const doerStats = breakdown?.doer;
  const clientStats = breakdown?.client;
  const hasRoleBreakdown =
    toNum(doerStats?.count) > 0 || toNum(clientStats?.count) > 0;

  if (!hasReviews && !showAll) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          {t("profile.ratings.noRatings", "Sin calificaciones aún")}
        </p>
      </div>
    );
  }

  // Perfiles sin desglose calculado todavía: promedios globales planos
  const legacyDimensions = (Object.keys(DIMENSION_UI) as DimensionKey[]).filter(
    (key) => showAll || toNum(user[DIMENSION_UI[key].legacyKey]) > 0,
  );

  return (
    <div className="space-y-2">
      {/* Total / overall */}
      <div className="flex items-center justify-between bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-900/30 dark:to-indigo-900/30 border border-sky-200 dark:border-sky-800 rounded-xl px-4 py-3 mb-1">
        <div className="flex items-center gap-2">
          <div className="bg-sky-100 dark:bg-sky-800 rounded-lg p-1.5">
            <UserCheck className="w-4 h-4 text-sky-600 dark:text-sky-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
              {t("profile.ratings.total", "Puntuación total")}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {hasReviews
                ? t("profile.ratings.count", { count: user.reviewsCount })
                : t("profile.ratings.noRatingsShort", "Sin calificaciones")}
            </p>
          </div>
        </div>
        {hasReviews ? (
          <div className="flex items-center gap-2">
            <Stars value={toNum(user.rating)} color="text-sky-500" />
            <span className="text-lg font-bold text-sky-600 dark:text-sky-300">
              {toNum(user.rating).toFixed(1)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>

      {hasRoleBreakdown ? (
        <>
          {toNum(doerStats?.count) > 0 && (
            <RoleSection
              role="doer"
              stats={doerStats as RoleRatingStats}
              showAll={showAll}
            />
          )}
          {toNum(clientStats?.count) > 0 && (
            <RoleSection
              role="client"
              stats={clientStats as RoleRatingStats}
              showAll={showAll}
            />
          )}
        </>
      ) : (
        legacyDimensions.map((key) => (
          <DimensionRow
            key={key}
            dimension={key}
            value={toNum(user[DIMENSION_UI[key].legacyKey])}
          />
        ))
      )}
    </div>
  );
}
