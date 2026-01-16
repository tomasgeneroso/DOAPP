import { User } from '../../types';
import { Star, Briefcase, UserCheck, FileText } from 'lucide-react';

interface MultipleRatingsProps {
  user: User;
  showAll?: boolean;
}

// Helper to safely convert rating to number
const toNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
};

export default function MultipleRatings({ user, showAll = true }: MultipleRatingsProps) {
  const ratings = [
    {
      icon: Star,
      label: 'Calidad de Trabajo',
      description: 'Evalúa la calidad técnica y profesional del trabajo entregado',
      rating: user.workQualityRating,
      count: user.workQualityReviewsCount,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-800',
    },
    {
      icon: UserCheck,
      label: 'Como Trabajador',
      description: 'Evalúa la comunicación, puntualidad y actitud profesional',
      rating: user.workerRating,
      count: user.workerReviewsCount,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-800',
    },
    {
      icon: FileText,
      label: 'Cumplimiento de Contratos',
      description: 'Evalúa el cumplimiento de plazos, presupuestos y acuerdos establecidos',
      rating: user.contractRating,
      count: user.contractReviewsCount,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-800',
    },
  ];

  // Filter out ratings with no reviews if not showing all
  const visibleRatings = showAll
    ? ratings
    : ratings.filter(r => r.count && r.count > 0);

  if (visibleRatings.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Sin puntuaciones todavía
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleRatings.map((item) => {
        const Icon = item.icon;
        const hasRating = item.count && item.count > 0;

        return (
          <div
            key={item.label}
            className={`${item.bgColor} rounded-lg p-3 ${!hasRating && 'opacity-50'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 group relative">
                <Icon className={`w-5 h-5 ${item.color}`} />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-help">
                  {item.label}
                </span>
                {/* Tooltip */}
                <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] pointer-events-none border border-gray-700" style={{ backgroundColor: 'rgb(17, 24, 39)' }}>
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 border-l border-t border-gray-700 transform rotate-45" style={{ backgroundColor: 'rgb(17, 24, 39)' }}></div>
                  {item.description}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasRating ? (
                  <>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= Math.round(toNumber(item.rating))
                              ? `${item.color} fill-current`
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {toNumber(item.rating).toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({item.count})
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Sin puntuaciones
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Overall Rating */}
      {user.reviewsCount > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-800 dark:to-pink-800 rounded-lg p-3 border border-purple-200 dark:border-purple-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 group relative">
              <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-help">
                Puntuación General
              </span>
              {/* Tooltip */}
              <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] pointer-events-none border border-gray-700" style={{ backgroundColor: 'rgb(17, 24, 39)' }}>
                <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 border-l border-t border-gray-700 transform rotate-45" style={{ backgroundColor: 'rgb(17, 24, 39)' }}></div>
                Promedio de todas las calificaciones recibidas en la plataforma
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= Math.round(toNumber(user.rating))
                        ? 'text-purple-600 dark:text-purple-400 fill-current'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {toNumber(user.rating).toFixed(1)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({user.reviewsCount})
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
