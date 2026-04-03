import { useState } from 'react';
import { Star, X, Send, Briefcase, Calendar, Clock } from 'lucide-react';
import { api } from '@/lib/api';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contractId: string;
  otherUserName: string;
  otherUserAvatar?: string;
  jobTitle: string;
  jobStartDate?: string;
  jobEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  role: 'client' | 'doer'; // who is writing the review
}

const StarRating = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) => {
  const [hover, setHover] = useState(0);

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={`w-7 h-7 ${
                star <= (hover || value)
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-gray-300 dark:text-gray-600'
              } transition-colors`}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default function ReviewModal({
  isOpen,
  onClose,
  onSuccess,
  contractId,
  otherUserName,
  otherUserAvatar,
  jobTitle,
  jobStartDate,
  jobEndDate,
  actualStartDate,
  actualEndDate,
  role,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [communication, setCommunication] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [quality, setQuality] = useState(0);
  const [timeliness, setTimeliness] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Seleccioná una puntuación general');
      return;
    }
    if (comment.length < 10) {
      setError('El comentario debe tener al menos 10 caracteres');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const body: any = {
        contractId,
        rating,
        comment,
      };

      if (communication > 0) body.communication = communication;
      if (professionalism > 0) body.professionalism = professionalism;
      if (quality > 0) body.quality = quality;
      if (timeliness > 0) body.timeliness = timeliness;

      await api.post('/reviews', body);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error al enviar la reseña');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {role === 'client' ? 'Calificá al trabajador' : 'Calificá al cliente'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Job Details */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Briefcase className="h-5 w-5 text-sky-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">{jobTitle}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {(actualStartDate || jobStartDate) && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(actualStartDate || jobStartDate)}
                    </span>
                  )}
                  {actualStartDate && actualEndDate && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTime(actualStartDate)} - {formatTime(actualEndDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Who you're reviewing */}
          <div className="flex items-center gap-3">
            <img
              src={otherUserAvatar || '/default-avatar.png'}
              alt={otherUserName}
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-slate-600"
            />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {role === 'client' ? 'Trabajador' : 'Cliente'}
              </p>
              <p className="font-semibold text-gray-900 dark:text-white">{otherUserName}</p>
            </div>
          </div>

          {/* Overall Rating */}
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Puntuación general *
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-125"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= rating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-300 dark:text-gray-600'
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {rating === 1 && 'Malo'}
                {rating === 2 && 'Regular'}
                {rating === 3 && 'Bueno'}
                {rating === 4 && 'Muy bueno'}
                {rating === 5 && 'Excelente'}
              </p>
            )}
          </div>

          {/* Specific Ratings */}
          <div className="grid grid-cols-2 gap-4">
            <StarRating value={communication} onChange={setCommunication} label="Comunicación" />
            <StarRating value={professionalism} onChange={setProfessionalism} label="Profesionalismo" />
            <StarRating value={quality} onChange={setQuality} label="Calidad" />
            <StarRating value={timeliness} onChange={setTimeliness} label="Puntualidad" />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Comentario * <span className="font-normal text-gray-400">(mín. 10 caracteres)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                role === 'client'
                  ? '¿Cómo fue tu experiencia con el trabajador? ¿Cumplió con lo acordado?'
                  : '¿Cómo fue tu experiencia con el cliente? ¿Fue claro con las instrucciones?'
              }
              rows={4}
              maxLength={1000}
              className="w-full rounded-xl border-2 border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 text-gray-900 dark:text-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{comment.length}/1000</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Send className="h-5 w-5" />
                Enviar opinión
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
