import { useState } from 'react';
import { Star, Clock, MapPin, Heart, DollarSign, Wrench } from 'lucide-react';

/**
 * Dimensiones de puntuación compartidas por el formulario completo de reseña
 * y por la encuesta post-trabajo, para que ambas usen el mismo vocabulario.
 */
export const DIMENSIONS = [
  {
    key: 'timeliness' as const,
    labelKey: 'review.dimTimeliness',
    labelDefault: 'Puntualidad',
    descKey: 'review.dimTimelinessDesc',
    descDefault: '¿Llegó a la hora acordada?',
    icon: Clock,
    color: 'text-blue-500',
  },
  {
    key: 'attendance' as const,
    labelKey: 'review.dimAttendance',
    labelDefault: 'Presencialidad',
    descKey: 'review.dimAttendanceDesc',
    descDefault: '¿Se presentó? ¿No te dejó esperando o plantado?',
    icon: MapPin,
    color: 'text-orange-500',
  },
  {
    key: 'communication' as const,
    labelKey: 'review.dimCommunication',
    labelDefault: 'Como persona',
    descKey: 'review.dimCommunicationDesc',
    descDefault: 'Trato, actitud y respeto durante el trabajo',
    icon: Heart,
    color: 'text-pink-500',
  },
  {
    key: 'fairPrice' as const,
    labelKey: 'review.dimFairPrice',
    labelDefault: 'Precio justo',
    descKey: 'review.dimFairPriceDesc',
    descDefault: '¿Cobró lo acordado? ¿Sin cargos sorpresa?',
    icon: DollarSign,
    color: 'text-green-500',
  },
  {
    key: 'quality' as const,
    labelKey: 'review.dimQuality',
    labelDefault: 'Calidad de trabajo',
    descKey: 'review.dimQualityDesc',
    descDefault: 'Resultado final: ¿quedó bien hecho?',
    icon: Star,
    color: 'text-yellow-500',
  },
  {
    key: 'professionalism' as const,
    labelKey: 'review.dimProfessionalism',
    labelDefault: 'Profesionalidad',
    descKey: 'review.dimProfessionalismDesc',
    descDefault: 'Herramientas ordenadas, presencia limpia, trabajo prolijo',
    icon: Wrench,
    color: 'text-violet-500',
  },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]['key'];

export type ReviewedRole = 'doer' | 'client';

/**
 * Al cliente se lo puntúa sólo en las dimensiones que le aplican
 * (no tiene "calidad de trabajo" ni "profesionalidad").
 */
const CLIENT_DIMENSION_KEYS: DimensionKey[] = ['timeliness', 'communication', 'fairPrice'];

export function dimensionsForRole(role: ReviewedRole) {
  if (role === 'client') {
    return DIMENSIONS.filter(d => CLIENT_DIMENSION_KEYS.includes(d.key));
  }
  return [...DIMENSIONS];
}

export const emptyDimensions = (): Record<DimensionKey, number> => ({
  timeliness: 0,
  attendance: 0,
  communication: 0,
  fairPrice: 0,
  quality: 0,
  professionalism: 0,
});

export const getRatingLabels = (t: (k: string, d: string) => string) => [
  '',
  t('review.rating1', 'Muy malo'),
  t('review.rating2', 'Malo'),
  t('review.rating3', 'Regular'),
  t('review.rating4', 'Bueno'),
  t('review.rating5', 'Excelente'),
];

interface StarPickerProps {
  value: number;
  onChange: (v: number) => void;
  color: string;
  /** Color de las estrellas vacías (por defecto, tema claro/oscuro) */
  emptyColor?: string;
  /** Clases de tamaño de cada estrella */
  size?: string;
}

export function StarPicker({
  value,
  onChange,
  color,
  emptyColor = 'text-gray-200 dark:text-gray-600',
  size = 'w-6 h-6',
}: StarPickerProps) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 focus:outline-none"
        >
          <Star
            className={`${size} transition-colors ${
              s <= (hover || value) ? `${color} fill-current` : emptyColor
            }`}
          />
        </button>
      ))}
    </div>
  );
}
