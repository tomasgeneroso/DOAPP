import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function WorkerModeToggle() {
  const { t } = useTranslation();
  const { user, token, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const isWorker = user.role === 'doer' || user.role === 'both';
  const isClient = user.role === 'client' || user.role === 'both' || user.role === 'user';

  const toggleMode = async (targetMode: 'doer' | 'client' | 'both') => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: targetMode }),
      });
      const data = await res.json();
      if (data.success) await refreshUser();
    } catch {}
    setLoading(false);
  };

  const handleWorkerClick = () => {
    if (isWorker && isClient) {
      // Deactivate worker → go to client only
      toggleMode('client');
    } else if (!isWorker) {
      // Activate worker
      toggleMode(isClient ? 'both' : 'doer');
    }
    // If isWorker && !isClient → can't deactivate (only mode)
  };

  const handleClientClick = () => {
    if (isClient && isWorker) {
      // Deactivate client → go to worker only
      toggleMode('doer');
    } else if (!isClient) {
      // Activate client
      toggleMode(isWorker ? 'both' : 'client');
    }
    // If isClient && !isWorker → can't deactivate (only mode)
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">{t('profile.activeModes', 'Modos activos')}</p>
      <div className="flex items-center gap-3">
        {/* Client mode */}
        <button
          onClick={handleClientClick}
          disabled={loading || (isClient && !isWorker)}
          title={isClient ? (isWorker ? t('profile.deactivateClientMode', 'Desactivar modo cliente') : t('profile.clientModeOnly', 'Modo cliente activo (único modo)')) : t('profile.activateClientMode', 'Activar modo cliente')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
            isClient
              ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-sky-400'
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
          {t('profile.clientMode', 'Modo cliente')}
        </button>

        {/* Worker mode */}
        <button
          onClick={handleWorkerClick}
          disabled={loading || (isWorker && !isClient)}
          title={isWorker ? (isClient ? t('profile.deactivateWorkerMode', 'Desactivar modo trabajador') : t('profile.workerModeOnly', 'Modo trabajador activo (único modo)')) : t('profile.activateWorkerMode', 'Activar modo trabajador')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
            isWorker
              ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-emerald-400'
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
          {t('profile.workerMode', 'Modo trabajador')}
        </button>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {user.role === 'both' ? t('profile.modeBothDesc', 'Podés publicar trabajos y aplicar a trabajos') : isWorker ? t('profile.modeWorkerDesc', 'Podés aplicar a trabajos y enviar cotizaciones') : t('profile.modeClientDesc', 'Podés publicar y contratar trabajadores')}
      </p>
    </div>
  );
}
