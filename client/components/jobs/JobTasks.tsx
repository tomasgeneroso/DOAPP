import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSocket } from "../../hooks/useSocket";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Lock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";

interface JobTask {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  status: "pending" | "in_progress" | "completed";
  isUnlocked: boolean;
  startedAt?: string;
  completedAt?: string;
  dueDate?: string; // Optional due date for the task (only used when singleDelivery is false)
  completedBy?: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdBy?: {
    id: string;
    name: string;
    avatar?: string;
  };
}

interface JobTasksProps {
  jobId: string;
  isOwner: boolean;
  isWorker: boolean;
  jobStatus: string;
  singleDelivery?: boolean; // If false, allow per-task due dates
  jobEndDate?: string; // End date of the job (for validation)
  clientConfirmed?: boolean; // If true, tasks cannot be added/edited
}

export default function JobTasks({ jobId, isOwner, isWorker, jobStatus, singleDelivery = true, jobEndDate, clientConfirmed = false }: JobTasksProps) {
  const { token } = useAuth();
  const { registerJobUpdateHandler } = useSocket();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Add/Edit task form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTask, setEditingTask] = useState<JobTask | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Updating task status
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/${jobId}/tasks`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setTasks(data.tasks || []);
        setProgress(data.progress || 0);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar tareas");
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Listen for task updates via socket
  const handleJobUpdate = useCallback((data: any) => {
    if (data.jobId === jobId && data.tasks) {
      setTasks(data.tasks);
      if (data.progress !== undefined) {
        setProgress(data.progress);
      }
    }
  }, [jobId]);

  useEffect(() => {
    registerJobUpdateHandler(handleJobUpdate);
  }, [registerJobUpdateHandler, handleJobUpdate]);

  // Create/Update task
  const handleSaveTask = async () => {
    if (!token || !taskTitle.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const url = editingTask
        ? `/api/jobs/${jobId}/tasks/${editingTask.id}`
        : `/api/jobs/${jobId}/tasks`;

      const response = await fetch(url, {
        method: editingTask ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim() || undefined,
          dueDate: !singleDelivery && taskDueDate ? taskDueDate : undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTasks(data.tasks || []);
        setProgress(data.progress || 0);
        resetForm();
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Error al guardar tarea");
    } finally {
      setSaving(false);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!token || !confirm("¿Seguro que deseas eliminar esta tarea?")) return;

    try {
      const response = await fetch(`/api/jobs/${jobId}/tasks/${taskId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setTasks(data.tasks || []);
        setProgress(data.progress || 0);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Error al eliminar tarea");
    }
  };

  // Update task status (for workers)
  const handleUpdateStatus = async (task: JobTask, newStatus: "pending" | "in_progress" | "completed") => {
    if (!token) return;

    setUpdatingTaskId(task.id);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (data.success) {
        setTasks(data.tasks || []);
        setProgress(data.progress || 0);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Error al actualizar estado");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingTask(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate("");
  };

  const startEdit = (task: JobTask) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description || "");
    setTaskDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : "");
    setShowAddForm(true);
  };

  // Get status icon and color
  const getStatusDisplay = (task: JobTask) => {
    if (!task.isUnlocked) {
      return {
        icon: <Lock className="h-5 w-5 text-slate-400" />,
        bgColor: "bg-slate-100 dark:bg-slate-700",
        textColor: "text-slate-400",
        label: "Bloqueada",
      };
    }

    switch (task.status) {
      case "completed":
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
          bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
          textColor: "text-emerald-600",
          label: "Completada",
        };
      case "in_progress":
        return {
          icon: <Clock className="h-5 w-5 text-amber-600" />,
          bgColor: "bg-amber-50 dark:bg-amber-900/20",
          textColor: "text-amber-600",
          label: "En progreso",
        };
      default:
        return {
          icon: <Circle className="h-5 w-5 text-slate-400" />,
          bgColor: "bg-slate-50 dark:bg-slate-800",
          textColor: "text-slate-500",
          label: "Pendiente",
        };
    }
  };

  // Get next status for worker action (allows toggling)
  const getNextStatus = (task: JobTask): "pending" | "in_progress" | "completed" | null => {
    if (!task.isUnlocked) return null;
    if (task.status === "pending") return "in_progress";
    if (task.status === "in_progress") return "completed";
    if (task.status === "completed") return "in_progress"; // Allow toggling back
    return null;
  };

  // Calculate display progress (capped at 90%, remaining 10% is for contract completion)
  const displayProgress = Math.min(Math.round(progress * 0.9), 90);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </div>
    );
  }

  // Don't show if no tasks and user is not owner
  if (tasks.length === 0 && !isOwner) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tareas
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {tasks.filter(t => t.status === "completed").length} de {tasks.length} completadas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          {tasks.length > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {displayProgress}%
              </span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 p-4">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Mobile progress bar */}
          {tasks.length > 0 && (
            <div className="sm:hidden mb-4 flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {displayProgress}%
              </span>
            </div>
          )}

          {/* Task list */}
          <div className="space-y-2">
            {tasks.map((task, index) => {
              const statusDisplay = getStatusDisplay(task);
              const nextStatus = getNextStatus(task);
              const isUpdating = updatingTaskId === task.id;

              return (
                <div
                  key={task.id}
                  className={`relative rounded-lg border ${
                    !task.isUnlocked
                      ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-60"
                      : task.status === "completed"
                      ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10"
                      : task.status === "in_progress"
                      ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  } p-3 transition-all`}
                >
                  <div className="flex items-start gap-3">
                    {/* Order number */}
                    <div className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {index + 1}
                    </div>

                    {/* Status icon / Action button */}
                    <div className="flex-shrink-0">
                      {isWorker && task.isUnlocked && nextStatus ? (
                        <button
                          onClick={() => handleUpdateStatus(task, nextStatus)}
                          disabled={isUpdating}
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${statusDisplay.bgColor} hover:opacity-80 transition-opacity disabled:opacity-50`}
                          title={
                            task.status === "completed"
                              ? "Desmarcar (volver a en progreso)"
                              : nextStatus === "in_progress"
                              ? "Iniciar tarea"
                              : "Marcar como completada"
                          }
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                          ) : (
                            statusDisplay.icon
                          )}
                        </button>
                      ) : (
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${statusDisplay.bgColor}`}>
                          {statusDisplay.icon}
                        </div>
                      )}
                    </div>

                    {/* Task content */}
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-medium ${
                        task.status === "completed"
                          ? "text-slate-500 line-through"
                          : "text-slate-900 dark:text-white"
                      }`}>
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {task.description}
                        </p>
                      )}
                      {/* Due date display (when singleDelivery is false) */}
                      {!singleDelivery && task.dueDate && task.status !== "completed" && (
                        <p className="mt-1 text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Entrega estimada: {new Date(task.dueDate).toLocaleDateString("es-AR", {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                          })}
                        </p>
                      )}
                      {task.completedAt && (
                        <p className="mt-1 text-xs text-emerald-600">
                          Completada el {new Date(task.completedAt).toLocaleDateString("es-AR")}
                          {task.completedBy && ` por ${task.completedBy.name}`}
                        </p>
                      )}
                    </div>

                    {/* Owner actions */}
                    {isOwner && (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <button
                          onClick={() => startEdit(task)}
                          className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {tasks.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                {isOwner
                  ? "No hay tareas definidas. Opcionalmente, puedes agregar tareas para organizar el trabajo."
                  : "No hay tareas definidas para este trabajo."}
              </p>
            </div>
          )}

          {/* Add task form (owner only, not when confirmed) */}
          {isOwner && !clientConfirmed && (
            <div className="mt-4">
              {showAddForm ? (
                <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/10 p-4">
                  <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                    {editingTask ? "Editar tarea" : "Nueva tarea"}
                  </h4>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Título de la tarea"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:text-white"
                    maxLength={200}
                  />
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Descripción (opcional)"
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:text-white resize-none"
                  />
                  {/* Due date field - only shown when singleDelivery is false */}
                  {!singleDelivery && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        <Calendar className="inline h-3 w-3 mr-1" />
                        Fecha de entrega estimada (opcional)
                      </label>
                      <input
                        type="datetime-local"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        max={jobEndDate ? new Date(jobEndDate).toISOString().slice(0, 16) : undefined}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:text-white"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        Esta fecha es solo una guía. La fecha de entrega final del trabajo sigue siendo la importante.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveTask}
                      disabled={saving || !taskTitle.trim()}
                      className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingTask ? "Guardar" : "Agregar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 py-3 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-sky-500 hover:text-sky-600 dark:hover:border-sky-500 dark:hover:text-sky-400 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Agregar tarea (opcional)
                </button>
              )}
            </div>
          )}

          {/* Info for workers */}
          {isWorker && tasks.length > 0 && (
            <p className="mt-4 text-xs text-center text-slate-400 dark:text-slate-500">
              Haz clic en las tareas para cambiar su estado. El progreso máximo es 90% - el 10% restante se completa al finalizar el contrato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
