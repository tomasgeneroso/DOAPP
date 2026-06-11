import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

interface WorkerSelectionInfoProps {
  jobId: string;
  onSelectionCancelled?: () => void;
}

export default function WorkerSelectionInfo({ jobId, onSelectionCancelled }: WorkerSelectionInfoProps) {
  const [status, setStatus] = useState<any>(null);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Actualizar cada minuto
    return () => clearInterval(interval);
  }, [jobId]);

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth(`/api/contracts/${jobId}/worker-selection-status`);
      const data = await res.json();
      if (data.success) {
        setStatus(data);
        setError(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      console.error('Error fetching worker selection status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSelection = async () => {
    if (!status?.canCancelSelection) return;

    setCancelling(true);
    try {
      const res = await fetchWithAuth(`/api/contracts/${jobId}/cancel-worker-selection`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success) {
        setStatus({ ...status, hasWorkerSelected: false });
        onSelectionCancelled?.();
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cancelar la selección');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse">
        <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded w-full" />
      </div>
    );
  }

  if (!status?.hasWorkerSelected) {
    return null;
  }

  const canCancel = status?.canCancelSelection;
  const hoursRemaining = status?.hoursUntilStart || 0;

  return (
    <div className={`p-4 rounded-lg border ${
      canCancel
        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
    }`}>
      <div className="flex items-start gap-3">
        {canCancel ? (
          <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        ) : (
          <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
        )}

        <div className="flex-1">
          <h4 className={`font-semibold mb-1 ${
            canCancel
              ? 'text-blue-900 dark:text-blue-100'
              : 'text-orange-900 dark:text-orange-100'
          }`}>
            Worker seleccionado
          </h4>

          <p className={`text-sm mb-3 ${
            canCancel
              ? 'text-blue-800 dark:text-blue-200'
              : 'text-orange-800 dark:text-orange-200'
          }`}>
            {status?.message}
          </p>

          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className={`px-2 py-1 rounded-full ${
              canCancel
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
            }`}>
              Faltan {hoursRemaining.toFixed(1)} horas
            </span>

            {canCancel && (
              <button
                onClick={handleCancelSelection}
                disabled={cancelling}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar selección'}
              </button>
            )}
          </div>

          {status?.membershipType === 'super_pro' && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              👑 Super PRO: puedes cancelar hasta 24 horas antes del trabajo
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
