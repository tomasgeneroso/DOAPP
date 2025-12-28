import React, { useState, useEffect } from 'react';
import { Contract, JobTask } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { AlertTriangle, Calendar, CheckCircle, XCircle, Clock, ListChecks } from 'lucide-react';

interface TaskClaimResponseProps {
  contract: Contract;
  onSuccess: () => void;
}

export default function TaskClaimResponse({
  contract,
  onSuccess,
}: TaskClaimResponseProps) {
  const { user } = useAuth();
  const [claimedTasks, setClaimedTasks] = useState<JobTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if current user is the doer
  const isDoer = typeof contract.doer === 'object'
    ? contract.doer._id === user?._id
    : contract.doer === user?._id;

  // Load claimed tasks
  useEffect(() => {
    const loadClaimedTasks = async () => {
      if (!contract.hasPendingTaskClaim || !contract.claimedTaskIds?.length) {
        setLoadingTasks(false);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/contracts/${contract._id}/task-claim`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (data.success && data.claimedTasks) {
          setClaimedTasks(data.claimedTasks);
        }
      } catch (err) {
        console.error('Error loading claimed tasks:', err);
      } finally {
        setLoadingTasks(false);
      }
    };

    loadClaimedTasks();
  }, [contract._id, contract.hasPendingTaskClaim, contract.claimedTaskIds]);

  const handleResponse = async (accept: boolean) => {
    if (!accept && !rejectionReason.trim()) {
      setError('Debes explicar por qué rechazas el reclamo');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contracts/${contract._id}/respond-task-claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accept,
          rejectionReason: accept ? undefined : rejectionReason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al responder al reclamo');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Don't show if no pending claim or user is not the doer
  if (!contract.hasPendingTaskClaim || !isDoer) {
    return null;
  }

  const clientName = typeof contract.client === 'object'
    ? contract.client.name
    : 'El cliente';

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-100 dark:bg-amber-900/40 px-6 py-4 border-b border-amber-200 dark:border-amber-700">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">
              Reclamo de Tareas Incompletas
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {clientName} ha reclamado que algunas tareas no fueron completadas
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-5">
        {/* Claim Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm">
              Reclamado el: {contract.taskClaimRequestedAt
                ? new Date(contract.taskClaimRequestedAt).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm">
              Nueva fecha propuesta: {contract.taskClaimNewEndDate
                ? new Date(contract.taskClaimNewEndDate).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Reason */}
        {contract.taskClaimReason && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Motivo del reclamo:
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              {contract.taskClaimReason}
            </p>
          </div>
        )}

        {/* Claimed Tasks */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Tareas reclamadas ({contract.claimedTaskIds?.length || 0}):
            </span>
          </div>

          {loadingTasks ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-600"></div>
            </div>
          ) : (
            <div className="space-y-2 bg-white dark:bg-gray-800 rounded-lg p-3">
              {claimedTasks.length > 0 ? (
                claimedTasks.map((task) => (
                  <div
                    key={task._id || task.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No se pudieron cargar las tareas reclamadas
                </p>
              )}
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex gap-3">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-200">
              <p className="font-medium mb-1">Atención:</p>
              <p>
                Si rechazas este reclamo, se creará automáticamente una disputa
                y un administrador revisará el caso. Asegurate de tener evidencia
                de que completaste las tareas.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Rejection Reason Form */}
        {showRejectForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Explica por qué rechazas el reclamo *
            </label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explica por qué consideras que las tareas sí fueron completadas..."
              rows={4}
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Esta explicación será visible en la disputa que se creará
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-amber-200 dark:border-amber-700">
          {!showRejectForm ? (
            <>
              <Button
                onClick={() => handleResponse(true)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="h-5 w-5" />
                {loading ? 'Procesando...' : 'Aceptar y Completar Tareas'}
              </Button>
              <Button
                onClick={() => setShowRejectForm(true)}
                disabled={loading}
                variant="secondary"
                className="flex-1 flex items-center justify-center gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <XCircle className="h-5 w-5" />
                Rechazar Reclamo
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => setShowRejectForm(false)}
                disabled={loading}
                variant="secondary"
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleResponse(false)}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                <XCircle className="h-5 w-5" />
                {loading ? 'Procesando...' : 'Confirmar Rechazo'}
              </Button>
            </>
          )}
        </div>

        {/* Info about acceptance */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800 dark:text-green-200">
              <p className="font-medium mb-1">Si aceptas:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>El contrato se extenderá hasta la nueva fecha propuesta</li>
                <li>Las tareas reclamadas volverán a estado "pendiente"</li>
                <li>Deberás completarlas antes de la nueva fecha</li>
                <li>El pago se liberará una vez confirmado que todo está completo</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
