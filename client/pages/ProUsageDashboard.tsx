import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { MembershipUsage } from '../types';
import { Crown, TrendingUp, Calendar, Gift, CheckCircle, Sparkles } from 'lucide-react';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function ProUsageDashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<MembershipUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/membership/usage', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setUsage(data.data);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <p className="text-red-800 dark:text-red-200">
            {error || t('proUsage.notPro', 'Esta función solo está disponible para miembros PRO')}
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate('/dashboard')}
            className="mt-4"
          >
            {t('proUsage.backToDashboard', 'Volver al Dashboard')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Says why the account has the PRO features. Showing the badge without
          the reason invites the reading that it was bought, which makes the end
          of the beta feel like something being taken away. */}
      {(user as any)?.membershipIsFromBeta && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 mb-4">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Tenés <strong className="font-semibold">las funciones PRO sin costo porque estás en la beta</strong>,
            junto con la exención de comisión. Tu plan contratado sigue siendo{" "}
            <strong className="font-semibold">{((user as any)?.realMembershipTier ?? 'free') === 'free' ? 'FREE' : 'PRO'}</strong>.
            Al terminar la beta volvés a ese plan, salvo que contrates otro.
          </p>
        </div>
      )}

      {/* Header */}
      <div className={`rounded-lg p-6 mb-6 text-white ${
        user?.membershipTier === 'super_pro'
          ? 'bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 border-2 border-yellow-400'
          : 'bg-gradient-to-r from-purple-600 to-blue-600'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
              {user?.membershipTier === 'super_pro' ? (
                <>
                  <Sparkles className="w-8 h-8 text-yellow-300 animate-pulse" />
                  {t('proUsage.dashboardSuperPro', 'Dashboard PRO')}
                </>
              ) : (
                <>
                  <Crown className="w-8 h-8 text-yellow-300" />
                  {t('proUsage.membershipPro', 'Tu membresía PRO')}
                </>
              )}
            </h1>
            <p className={user?.membershipTier === 'super_pro' ? 'text-pink-100' : 'text-purple-100'}>
              {user?.membershipTier === 'super_pro'
                ? t('proUsage.subtitleSuperPro', 'Analytics avanzados y Centro Profesional')
                : t('proUsage.subtitlePro', 'Visibilidad y estadísticas de tu perfil')
              }
            </p>
          </div>
          <div className="hidden md:block">
            {user?.membershipTier === 'super_pro' ? (
              <Sparkles className="w-24 h-24 text-white/20" />
            ) : (
              <Crown className="w-24 h-24 text-white/20" />
            )}
          </div>
        </div>
      </div>

      {/* Centro Profesional CTA (cuentas con el panel completo) */}
      {user?.membershipTier === 'super_pro' && (
        <button
          onClick={() => navigate('/pro/finanzas')}
          className="w-full text-left bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 rounded-lg p-5 mb-6 text-white hover:opacity-95 transition-opacity flex items-center justify-between"
        >
          <div>
            <p className="font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-300" /> {t('proUsage.professionalCenter', 'Centro Profesional')}
            </p>
            <p className="text-sm text-white/80 mt-1">
              {t('proUsage.professionalCenterDesc', 'Tu facturación, impuestos, reputación y matrícula — explicado en simple.')}
            </p>
          </div>
          <span className="text-2xl">→</span>
        </button>
      )}

      {/* Estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {usage.nextReset ? new Date(usage.nextReset).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('proUsage.planValidUntil', 'Plan PRO válido hasta')}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <Gift className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {user?.freeContractsRemaining || 0}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('proUsage.freeContracts', 'Contratos libres de comisión')}
          </p>
        </div>
      </div>

      {/* Grid con beneficios */}
      <div className="grid grid-cols-1 gap-6">
        {/* Información adicional - Beneficios de la membresía actual */}
        <div className={`rounded-lg p-6 ${
          user?.membershipTier === 'super_pro'
            ? 'bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-indigo-900/20 border-2 border-purple-300 dark:border-purple-700'
            : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
        }`}>
          <h3 className={`font-semibold mb-3 ${
            user?.membershipTier === 'super_pro'
              ? 'text-purple-900 dark:text-purple-100'
              : 'text-blue-900 dark:text-blue-100'
          }`}>
            {t('proUsage.benefitsPro', 'Beneficios de tu Membresía PRO')}
          </h3>
          <ul className={`space-y-2 text-sm ${
            user?.membershipTier === 'super_pro'
              ? 'text-purple-800 dark:text-purple-200'
              : 'text-blue-800 dark:text-blue-200'
          }`}>
            <li className="flex items-start gap-2">
              <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                user?.membershipTier === 'super_pro'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
              <span>{t('proUsage.benefitBadge', 'Badge {{tier}} verificado y prioridad en búsquedas', { tier: 'PRO' })}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                user?.membershipTier === 'super_pro'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
              <span>{t('proUsage.benefitStats', 'Estadísticas avanzadas y verificación de documentos de identidad')}</span>
            </li>
            {user?.membershipTier === 'super_pro' && (
              <>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <span><Trans i18nKey="proUsage.benefitAnalytics" components={{ b: <strong /> }} defaults="<b>Analytics avanzados</b> de visitas y conversaciones" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <span><Trans i18nKey="proUsage.benefitExclusiveDashboard" components={{ b: <strong /> }} defaults="<b>Dashboard exclusivo</b> con métricas detalladas" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <span><Trans i18nKey="proUsage.benefitMonthlyReports" components={{ b: <strong /> }} defaults="<b>Reportes mensuales</b> automatizados por email" /></span>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
