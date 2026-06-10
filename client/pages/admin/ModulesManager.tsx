import { useState, useEffect } from 'react';
import { Loader2, Check, X, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button.js';

interface ModuleInfo {
  moduleId: string;
  category: string;
  name: string;
  description?: string;
  isActive: boolean;
  config?: Record<string, any>;
}

export default function ModulesManager() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/modules', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (data.success) {
        setModules(data.modules);
      } else {
        setError(data.message || 'Error loading modules');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (moduleId: string, currentState: boolean) => {
    try {
      setUpdating(moduleId);
      setSuccess(null);
      const res = await fetch(`/api/admin/modules/${moduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ isActive: !currentState }),
      });
      const data = await res.json();
      if (data.success) {
        setModules((prev) =>
          prev.map((m) => (m.moduleId === moduleId ? { ...m, isActive: !currentState } : m)),
        );
        setSuccess(`${data.module.name} ${!currentState ? 'activated' : 'deactivated'}`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.message || 'Error updating module');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const resetModules = async () => {
    if (!confirm('Are you sure? This will reset all modules to default state.')) return;
    try {
      setUpdating('reset');
      const res = await fetch('/api/admin/modules/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (data.success) {
        setModules(data.modules);
        setSuccess('All modules reset to defaults');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.message || 'Error resetting modules');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  // Group by category
  const groupedByCategory = modules.reduce(
    (acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m);
      return acc;
    },
    {} as Record<string, ModuleInfo[]>,
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Modules Manager
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            Enable or disable features and payment methods for the platform
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-red-700 dark:text-red-300">{error}</div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-700 dark:text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex gap-3">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div className="text-green-700 dark:text-green-300">{success}</div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : (
          <>
            {Object.entries(groupedByCategory).map(([category, categoryModules]) => (
              <div
                key={category}
                className="mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white capitalize">
                    {category}
                  </h2>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {categoryModules.map((module) => (
                    <div
                      key={module.moduleId}
                      className="px-6 py-4 flex items-start justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {module.name}
                        </h3>
                        {module.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {module.description}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                          {module.moduleId}
                        </p>
                      </div>

                      <button
                        onClick={() => toggleModule(module.moduleId, module.isActive)}
                        disabled={updating === module.moduleId}
                        className={`ml-4 px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                          module.isActive
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        } disabled:opacity-60`}
                      >
                        {updating === module.moduleId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : module.isActive ? (
                          <>
                            <Check className="w-4 h-4" /> Active
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4" /> Inactive
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-3 mt-8">
              <Button
                onClick={fetchModules}
                disabled={loading}
                variant="secondary"
              >
                Refresh
              </Button>
              <Button
                onClick={resetModules}
                disabled={updating === 'reset'}
                variant="secondary"
              >
                {updating === 'reset' ? 'Resetting...' : 'Reset to Defaults'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
