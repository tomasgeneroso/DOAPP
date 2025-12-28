import React, { useState, useEffect } from 'react';
import { Contract, JobTask } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { X, CheckSquare, Square, Calendar, AlertTriangle } from 'lucide-react';

interface TaskClaimModalProps {
  contract: Contract;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TaskClaimModal({
  contract,
  isOpen,
  onClose,
  onSuccess,
}: TaskClaimModalProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tasks for this contract's job
  useEffect(() => {
    const loadTasks = async () => {
      if (!isOpen || !contract?.job) return;

      setLoadingTasks(true);
      try {
        const jobId = typeof contract.job === 'object' ? contract.job._id : contract.job;
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/jobs/${jobId}/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (data.success) {
          // Filter only incomplete tasks (not completed)
          const incompleteTasks = data.tasks.filter(
            (task: JobTask) => task.status !== 'completed'
          );
          setTasks(incompleteTasks);
        }
      } catch (err) {
        console.error('Error loading tasks:', err);
      } finally {
        setLoadingTasks(false);
      }
    };

    loadTasks();
  }, [isOpen, contract?.job]);

  // Set default date to tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setNewEndDate(tomorrow.toISOString().split('T')[0]);
  }, [isOpen]);

  const handleToggleTask = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleSelectAll = () => {
    if (selectedTasks.length === tasks.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(tasks.map(t => t._id || t.id || ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedTasks.length === 0) {
      setError('Debes seleccionar al menos una tarea');
      return;
    }

    if (!newEndDate) {
      setError('Debes seleccionar una nueva fecha de entrega');
      return;
    }

    const selectedDate = new Date(newEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate <= today) {
      setError('La nueva fecha debe ser posterior a hoy');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contracts/${contract._id}/claim-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          taskIds: selectedTasks,
          newEndDate,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al reclamar tareas');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Reclamar Tareas Incompletas
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Selecciona las tareas que no fueron completadas
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Importante:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>El trabajador recibirá una notificación de tu reclamo</li>
                  <li>Si acepta, el contrato se extenderá hasta la nueva fecha</li>
                  <li>Si rechaza, se creará una disputa automáticamente</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Task Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tareas No Completadas *
              </label>
              {tasks.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                >
                  {selectedTasks.length === tasks.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
              )}
            </div>

            {loadingTasks ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No hay tareas pendientes para reclamar.</p>
                <p className="text-sm mt-1">Todas las tareas fueron completadas.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                {tasks.map((task) => {
                  const taskId = task._id || task.id || '';
                  const isSelected = selectedTasks.includes(taskId);

                  return (
                    <div
                      key={taskId}
                      onClick={() => handleToggleTask(taskId)}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition ${
                        isSelected
                          ? 'bg-sky-50 dark:bg-sky-900/30 border-2 border-sky-500'
                          : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className={`font-medium ${isSelected ? 'text-sky-900 dark:text-sky-100' : 'text-gray-900 dark:text-white'}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            task.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}>
                            {task.status === 'pending' ? 'Pendiente' : 'En progreso'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedTasks.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {selectedTasks.length} tarea{selectedTasks.length > 1 ? 's' : ''} seleccionada{selectedTasks.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* New End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Calendar className="h-4 w-4 inline-block mr-1" />
              Nueva Fecha de Entrega *
            </label>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              La fecha debe ser al menos 1 día en el futuro
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Motivo del reclamo (opcional)
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explica por qué consideras que estas tareas no fueron completadas..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || selectedTasks.length === 0 || loadingTasks}
            >
              {loading ? 'Enviando...' : 'Enviar Reclamo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
