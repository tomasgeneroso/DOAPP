import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ofreceServicios, rolSegunOfrece } from '../../../shared/cuenta/capacidades';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * «Ofrezco mis servicios»: una sola llave en lugar de «modo cliente» y «modo trabajador». Todas las cuentas pueden publicar y postularse; esto solo decide si la
 * persona aparece en el buscador de profesionales y recibe los trabajos recomendados (ver shared/cuenta/capacidades.ts).
 */
export default function WorkerModeToggle() {
  const { t } = useTranslation();
  const { user, token, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const ofrece = ofreceServicios(user.role);

  const cambiar = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: rolSegunOfrece(!ofrece) }),
      });
      const data = await res.json();
      if (data.success) await refreshUser();
    } catch {
      /* sin respuesta: queda como estaba y se puede volver a probar */
    }
    setLoading(false);
  };

  return (
    <div className="space-y-2" data-testid="ofrezco-mis-servicios">
      <button
        type="button"
        role="switch"
        aria-checked={ofrece}
        onClick={cambiar}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
          ofrece
            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-emerald-400'
        }`}
      >
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
        {ofrece ? t('profile.offeringOn', 'Ofrezco mis servicios') : t('profile.offeringOff', 'Ofrecer mis servicios')}
      </button>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t(
          'profile.offeringDesc',
          'Siempre podés publicar trabajos y postularte a los de otras personas. Esto solo decide si aparecés en el buscador de profesionales y si te recomendamos trabajos.',
        )}
      </p>
    </div>
  );
}
