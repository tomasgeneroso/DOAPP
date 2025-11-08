import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { MembershipUsage } from '../types';
import { Crown, TrendingUp, Calendar, Gift, CheckCircle, Sparkles } from 'lucide-react';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function ProUsageDashboard() {
  const { user } = useAuth();
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
            {error || 'Esta función solo está disponible para miembros PRO'}
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate('/dashboard')}
            className="mt-4"
          >
            Volver al Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const progressPercentage = (usage.contractsUsed / usage.contractsLimit) * 100;
  const hasReachedBonus = usage.contractsUsed >= 3;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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
                  Dashboard SUPER PRO
                  <span className="text-sm bg-yellow-400 text-purple-900 px-3 py-1 rounded-full font-bold ml-2">
                    PREMIUM
                  </span>
                </>
              ) : (
                <>
                  <Crown className="w-8 h-8 text-yellow-300" />
                  Uso Mensual PRO
                </>
              )}
            </h1>
            <p className={user?.membershipTier === 'super_pro' ? 'text-pink-100' : 'text-purple-100'}>
              {user?.membershipTier === 'super_pro'
                ? 'Comisión del 2% + Analytics avanzados exclusivos'
                : 'Gestiona tus contratos mensuales con comisión reducida'
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
            Plan PRO válido hasta
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
            Contratos por Recomendación
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Progreso Mensual
        </h2>
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Contratos con {user?.membershipTier === 'super_pro' ? '2%' : '3%'} de comisión</span>
            <span>{usage.contractsUsed} de {usage.contractsLimit}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                user?.membershipTier === 'super_pro'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600'
              }`}
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            ></div>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Los contratos se resetean el día 1 de cada mes
        </p>
      </div>

      {/* Bonus Contract */}
      <div className={`rounded-lg shadow p-6 mb-6 ${
        usage.earnedBonusContract || hasReachedBonus
          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-400'
          : 'bg-white dark:bg-gray-800'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            usage.earnedBonusContract || hasReachedBonus
              ? 'bg-yellow-400'
              : 'bg-gray-100 dark:bg-gray-700'
          }`}>
            <Gift className={`w-6 h-6 ${
              usage.earnedBonusContract || hasReachedBonus
                ? 'text-white'
                : 'text-gray-400'
            }`} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              Contrato Bonus
              {usage.earnedBonusContract && (
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                  ¡Desbloqueado!
                </span>
              )}
            </h3>
            {usage.earnedBonusContract ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                🎉 ¡Felicitaciones! Completaste 3 contratos este mes y ganaste 1 contrato gratis adicional.
              </p>
            ) : hasReachedBonus ? (
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ✨ ¡Estás a punto de ganar 1 contrato bonus! Completa estos contratos para desbloquearlo.
              </p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Completa 3 contratos en este mes para ganar 1 contrato gratis adicional.
                Progreso: {usage.contractsUsed}/3
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Grid con beneficios */}
      <div className={`grid grid-cols-1 ${user?.membershipTier === 'super_pro' ? '' : 'md:grid-cols-2'} gap-6`}>
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
            {user?.membershipTier === 'super_pro' ? 'Beneficios de tu Membresía SUPER PRO' : 'Beneficios de tu Membresía PRO'}
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
              <span>3 contratos mensuales con solo {user?.membershipTier === 'super_pro' ? '2%' : '3%'} de comisión (vs 8% normal)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                user?.membershipTier === 'super_pro'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
              <span>Bonus de 1 contrato gratis al completar 3 contratos en el mes</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                user?.membershipTier === 'super_pro'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
              <span>Badge {user?.membershipTier === 'super_pro' ? 'SUPER PRO' : 'PRO'} verificado y prioridad en búsquedas</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                user?.membershipTier === 'super_pro'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
              <span>Estadísticas avanzadas y verificación de documentos de identidad</span>
            </li>
            {user?.membershipTier === 'super_pro' && (
              <>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Analytics avanzados</strong> de visitas y conversaciones</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Dashboard exclusivo</strong> con métricas detalladas</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Reportes mensuales</strong> automatizados por email</span>
                </li>
              </>
            )}
          </ul>
        </div>

        {/* Card Upgrade SUPER PRO - Solo si es PRO */}
        {user?.membershipTier === 'pro' && (
        <div className="bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-900/20 dark:via-purple-900/20 dark:to-indigo-900/20 border-2 border-purple-300 dark:border-purple-700 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/membership/checkout?plan=super_pro')}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                Upgrade a SUPER PRO
                <span className="text-xs bg-gradient-to-r from-purple-600 to-pink-600 text-white px-2 py-0.5 rounded-full">
                  Premium
                </span>
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                Maximiza tus beneficios
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-purple-800 dark:text-purple-200 mb-4">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <span><strong>Solo 2% de comisión</strong> en tus 3 contratos/mes</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <span><strong>Estadísticas avanzadas</strong> de perfil</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <span><strong>Analytics</strong> de visitas y conversaciones</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <span><strong>Reportes mensuales</strong> detallados</span>
            </li>
          </ul>

          <div className="flex items-center justify-between pt-3 border-t border-purple-200 dark:border-purple-800">
            <div>
              <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
                €8.99
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                por mes
              </p>
            </div>
            <Button
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/membership/checkout?plan=super_pro');
              }}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              <Crown className="w-4 h-4 mr-2" />
              Mejorar Plan
            </Button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
