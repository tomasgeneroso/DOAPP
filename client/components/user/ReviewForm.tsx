import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  DIMENSIONS,
  DimensionKey,
  StarPicker,
  emptyDimensions,
  getRatingLabels,
} from './reviewDimensions';

interface ReviewFormProps {
  contractId: string;
  reviewedName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ReviewForm({ contractId, reviewedName, onSuccess, onCancel }: ReviewFormProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const LABELS = getRatingLabels(t);

  const [overallRating, setOverallRating] = useState(0);
  const [dimensions, setDimensions] = useState<Record<DimensionKey, number>>(emptyDimensions);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setDim = (key: DimensionKey, value: number) =>
    setDimensions(prev => ({ ...prev, [key]: value }));

  // Auto-calculate overall from filled dimensions
  const filledDims = Object.values(dimensions).filter(v => v > 0);
  const autoOverall = filledDims.length > 0
    ? Math.round(filledDims.reduce((a, b) => a + b, 0) / filledDims.length)
    : 0;
  const effectiveOverall = overallRating || autoOverall;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveOverall === 0) { setError(t('review.errorNoRating', 'Calificá al menos una dimensión o la puntuación general')); return; }
    if (comment.length < 10) { setError(t('review.errorShortComment', 'El comentario debe tener al menos 10 caracteres')); return; }
    setError('');
    setLoading(true);
    try {
      const body: Record<string, any> = {
        contractId,
        rating: effectiveOverall,
        comment,
      };
      for (const dim of DIMENSIONS) {
        if (dimensions[dim.key] > 0) body[dim.key] = dimensions[dim.key];
      }

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t('review.errorSubmit', 'Error al enviar reseña'));
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 max-w-lg w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('review.title', 'Dejar reseña')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('review.forName', 'para {{name}}', { name: reviewedName })}</p>
        </div>
        <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Overall rating */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('review.overallRating', 'Puntuación general')}</span>
            {effectiveOverall > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{LABELS[effectiveOverall]}</span>
            )}
          </div>
          <StarPicker value={effectiveOverall} onChange={setOverallRating} color="text-sky-500" />
          {autoOverall > 0 && overallRating === 0 && (
            <p className="text-xs text-gray-400 mt-1">{t('review.autoCalculated', 'Calculado automáticamente del promedio de dimensiones')}</p>
          )}
        </div>

        {/* 6 dimensions */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {t('review.dimensionsHeader', 'Dimensiones (opcionales pero recomendadas)')}
          </p>
          {DIMENSIONS.map(({ key, labelKey, labelDefault, descKey, descDefault, icon: Icon, color }) => (
            <div key={key} className="flex items-start gap-3 py-1">
              <div className="flex items-start gap-2 w-48 shrink-0">
                <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{t(labelKey, labelDefault)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{t(descKey, descDefault)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-1 pt-0.5">
                <StarPicker value={dimensions[key]} onChange={v => setDim(key, v)} color={color} />
                {dimensions[key] > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{LABELS[dimensions[key]]}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Comment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('review.commentLabel', 'Comentario *')}
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            required
            rows={4}
            minLength={10}
            maxLength={1000}
            placeholder={t('review.commentPlaceholder', 'Contá tu experiencia con este trabajador...')}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{comment.length}/1000</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? t('review.submitting', 'Enviando...') : t('review.submit', 'Enviar reseña')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            {t('review.cancel', 'Cancelar')}
          </button>
        </div>
      </form>
    </div>
  );
}
