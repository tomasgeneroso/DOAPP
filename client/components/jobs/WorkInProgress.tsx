import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useSocket } from "../../hooks/useSocket";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  ChevronRight,
  Lock,
  AlertCircle,
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
}

interface JobWithTasks {
  job: {
    id: string;
    title: string;
    status: string;
    client: {
      id: string;
      name: string;
      avatar?: string;
    };
  };
  tasks: JobTask[];
  progress: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
}

export default function WorkInProgress() {
  const { token } = useAuth();
  const { registerJobUpdateHandler } = useSocket();
  const [jobsWithTasks, setJobsWithTasks] = useState<JobWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // Fetch active tasks
  const fetchActiveTasks = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch("/api/jobs/my-active-tasks", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setJobsWithTasks(data.jobs || []);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar tareas");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchActiveTasks();
  }, [fetchActiveTasks]);

  // Listen for task updates via socket
  const handleJobUpdate = useCallback((data: any) => {
    if (data.tasks && data.progress !== undefined) {
      // Refresh the list to get updated data
      fetchActiveTasks();
    }
  }, [fetchActiveTasks]);

  useEffect(() => {
    registerJobUpdateHandler(handleJobUpdate);
  }, [registerJobUpdateHandler, handleJobUpdate]);

  // Update task status
  const handleUpdateStatus = async (jobId: string, task: JobTask, newStatus: "in_progress" | "completed") => {
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
        // Refresh the list
        fetchActiveTasks();
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Error al actualizar estado");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Get next status for task
  const getNextStatus = (task: JobTask): "in_progress" | "completed" | null => {
    if (!task.isUnlocked) return null;
    if (task.status === "pending") return "in_progress";
    if (task.status === "in_progress") return "completed";
    return null;
  };

  // Get status icon
  const getStatusIcon = (task: JobTask) => {
    if (!task.isUnlocked) {
      return <Lock className="h-4 w-4 text-slate-400" />;
    }

    switch (task.status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-amber-600" />;
      default:
        return <Circle className="h-4 w-4 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="mt-10 sm:mt-16 px-2">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </div>
    );
  }

  // Don't show if no jobs with tasks
  if (jobsWithTasks.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 sm:mt-16 px-2">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Clock className="h-7 w-7 text-amber-500" />
          Trabajo en Proceso
        </h2>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {jobsWithTasks.map(({ job, tasks, progress, completedTasks, totalTasks }) => {
          // Cap progress at 90% (remaining 10% is for contract completion)
          const displayProgress = Math.min(Math.round(progress * 0.9), 90);

          return (
          <div
            key={job.id}
            className="rounded-2xl border-2 border-amber-400 dark:border-amber-500 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 p-6 shadow-md"
          >
            {/* Job Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <img
                    src={
                      job.client.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${job.client.name}`
                    }
                    alt={job.client.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-amber-900 dark:text-amber-100">
                    {job.title}
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Cliente: {job.client.name}
                  </p>
                </div>
              </div>
              <Link
                to={`/jobs/${job.id}`}
                className="flex items-center gap-1 text-sm font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Ver trabajo
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Progreso
                </span>
                <span className="text-sm font-bold text-amber-900 dark:text-amber-100">
                  {completedTasks} / {totalTasks} tareas ({displayProgress}%)
                </span>
              </div>
              <div className="h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
            </div>

            {/* Task list - show only first 3 pending/in-progress tasks */}
            <div className="space-y-2">
              {tasks
                .filter(t => t.status !== "completed")
                .slice(0, 3)
                .map((task, index) => {
                  const nextStatus = getNextStatus(task);
                  const isUpdating = updatingTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 rounded-lg p-3 ${
                        !task.isUnlocked
                          ? "bg-amber-100/50 dark:bg-amber-900/20 opacity-60"
                          : task.status === "in_progress"
                          ? "bg-amber-200 dark:bg-amber-800/40"
                          : "bg-white dark:bg-slate-800"
                      }`}
                    >
                      {/* Status icon / Action button */}
                      {task.isUnlocked && nextStatus ? (
                        <button
                          onClick={() => handleUpdateStatus(job.id, task, nextStatus)}
                          disabled={isUpdating}
                          className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                          title={
                            nextStatus === "in_progress"
                              ? "Iniciar tarea"
                              : "Marcar como completada"
                          }
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                          ) : (
                            getStatusIcon(task)
                          )}
                        </button>
                      ) : (
                        <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                          {getStatusIcon(task)}
                        </div>
                      )}

                      {/* Task content */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${
                          !task.isUnlocked ? "text-slate-500" : "text-slate-900 dark:text-white"
                        }`}>
                          {task.title}
                        </p>
                        {task.status === "in_progress" && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            En progreso
                          </span>
                        )}
                        {!task.isUnlocked && (
                          <span className="text-xs text-slate-400">
                            Completa la tarea anterior primero
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Show remaining tasks count */}
              {tasks.filter(t => t.status !== "completed").length > 3 && (
                <Link
                  to={`/jobs/${job.id}`}
                  className="block text-center text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 py-2"
                >
                  +{tasks.filter(t => t.status !== "completed").length - 3} tareas más
                </Link>
              )}

              {/* All tasks completed */}
              {tasks.every(t => t.status === "completed") && (
                <div className="flex items-center justify-center gap-2 py-4 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">¡Todas las tareas completadas!</span>
                </div>
              )}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
