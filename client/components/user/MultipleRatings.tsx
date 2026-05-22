import { User } from '../../types';
import { Star, Clock, UserCheck, DollarSign, Wrench, Heart, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MultipleRatingsProps {
  user: User;
  showAll?: boolean;
}

const toNum = (v: any): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
};

const DIMENSIONS = [
  {
    key: 'puntualidadRating' as keyof User,
    label: 'Puntualidad',
    desc: '¿Llegó a la hora acordada?',
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-100 dark:border-blue-800',
  },
  {
    key: 'presencialidadRating' as keyof User,
    label: 'Presencialidad',
    desc: '¿Se presentó? ¿No dejó plantado al cliente?',
    icon: MapPin,
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-100 dark:border-orange-800',
  },
  {
    key: 'comoPersonaRating' as keyof User,
    label: 'Como persona',
    desc: 'Trato, actitud y respeto hacia el cliente',
    icon: Heart,
    color: 'text-pink-500',
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    border: 'border-pink-100 dark:border-pink-800',
  },
  {
    key: 'precioJustoRating' as keyof User,
    label: 'Precio justo',
    desc: 'Cobró lo acordado, sin cargos sorpresa',
    icon: DollarSign,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-100 dark:border-green-800',
  },
  {
    key: 'calidadTrabajoRating' as keyof User,
    label: 'Calidad de trabajo',
    desc: 'Resultado final: ¿quedó bien hecho?',
    icon: Star,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-100 dark:border-yellow-800',
  },
  {
    key: 'profesionalidadRating' as keyof User,
    label: 'Profesionalidad',
    desc: 'Herramientas ordenadas, presencia limpia, trabajo prolijo',
    icon: Wrench,
    color: 'text-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    border: 'border-violet-100 dark:border-violet-800',
  },
] as const;

function Stars({ value, color }: { value: number; color: string }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${s <= rounded ? `${color} fill-current` : 'text-gray-200 dark:text-gray-600'}`}
        />
      ))}
    </div>
  );
}

export default function MultipleRatings({ user, showAll = true }: MultipleRatingsProps) {
  const { t } = useTranslation();
  const hasReviews = user.reviewsCount > 0;

  const visible = showAll
    ? DIMENSIONS
    : DIMENSIONS.filter(d => toNum(user[d.key]) > 0);

  if (!hasReviews && !showAll) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          {t('profile.ratings.noRatings', 'Sin calificaciones aún')}
        </p>
      </div>
    );
  }

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
              Puntuación total
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {hasReviews ? `${user.reviewsCount} calificacion${user.reviewsCount !== 1 ? 'es' : ''}` : 'Sin calificaciones'}
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

      {/* Per-dimension rows */}
      {visible.map(({ key, label, desc, icon: Icon, color, bg, border }) => {
        const val = toNum(user[key]);
        const rated = val > 0;

        return (
          <div
            key={key}
            className={`flex items-center justify-between ${bg} border ${border} rounded-lg px-3 py-2.5 group relative ${!rated && 'opacity-50'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon className={`w-4 h-4 ${color} shrink-0`} />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help">
                {label}
              </span>
              {/* Tooltip */}
              <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none">
                <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 rotate-45" />
                {desc}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {rated ? (
                <>
                  <Stars value={val} color={color} />
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100 w-8 text-right">
                    {val.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-400">Sin datos</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
