import React, { useEffect, useState } from 'react';
import { useMyAdvertisements } from '@/hooks/useAdvertisements';

const AdvertisementManager: React.FC = () => {
  const {
    ads,
    loading,
    error,
    stats,
    fetchMyAds,
    fetchStats,
    pauseAd,
    resumeAd,
    deleteAd,
    getPerformance,
  } = useMyAdvertisements();

  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    fetchMyAds(filterStatus);
    fetchStats();
  }, [filterStatus]);

  const handleViewPerformance = async (adId: string) => {
    try {
      const perf = await getPerformance(adId);
      setPerformance(perf);
      setSelectedAd(ads.find((ad) => ad._id === adId));
    } catch (err) {
      console.error('Error loading performance:', err);
    }
  };

  const handlePause = async (adId: string) => {
    if (confirm('¿Pausar esta publicidad?')) {
      try {
        await pauseAd(adId);
      } catch (err) {
        alert('Error al pausar la publicidad');
      }
    }
  };

  const handleResume = async (adId: string) => {
    if (confirm('¿Reanudar esta publicidad?')) {
      try {
        await resumeAd(adId);
      } catch (err) {
        alert('Error al reanudar la publicidad');
      }
    }
  };

  const handleDelete = async (adId: string) => {
    if (confirm('¿Eliminar esta publicidad? Esta acción no se puede deshacer.')) {
      try {
        await deleteAd(adId);
      } catch (err) {
        alert('Error al eliminar la publicidad');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pendiente' },
      active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Activa' },
      paused: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Pausada' },
      expired: { bg: 'bg-red-100', text: 'text-red-800', label: 'Expirada' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rechazada' },
    };

    const badge = badges[status] || badges.pending;

    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}
      >
        {badge.label}
      </span>
    );
  };

  const getAdTypeLabel = (adType: string) => {
    const labels: Record<string, string> = {
      model1: 'Banner 3x1',
      model2: 'Sidebar 1x2',
      model3: 'Card 1x1',
    };
    return labels[adType] || adType;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Gestor de Publicidad
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Administra tus campañas publicitarias y ve su rendimiento
          </p>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Total Anuncios
              </h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalAds}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Activos
              </h3>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {stats.activeAds}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Total Impresiones
              </h3>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {stats.totalImpressions?.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Total Clicks
              </h3>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {stats.totalClicks?.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="pending">Pendientes</option>
            <option value="paused">Pausados</option>
            <option value="expired">Expirados</option>
            <option value="rejected">Rechazados</option>
          </select>
        </div>

        {/* Ads List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        ) : ads.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-6xl mb-4">📢</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              No tienes publicidades
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Crea tu primera campaña publicitaria
            </p>
            <button className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-colors">
              Crear Publicidad
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ads.map((ad) => (
              <div
                key={ad._id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
              >
                {/* Image */}
                <div className="relative h-48">
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    {getStatusBadge(ad.status)}
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                    {ad.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {ad.description}
                  </p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Impresiones
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {ad.impressions}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Clicks</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {ad.clicks}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">CTR</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {ad.ctr.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Tipo:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {getAdTypeLabel(ad.adType)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <button
                      onClick={() => handleViewPerformance(ad._id)}
                      className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
                    >
                      Ver Rendimiento
                    </button>

                    {ad.status === 'active' && (
                      <button
                        onClick={() => handlePause(ad._id)}
                        className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors"
                      >
                        Pausar
                      </button>
                    )}

                    {ad.status === 'paused' && (
                      <button
                        onClick={() => handleResume(ad._id)}
                        className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
                      >
                        Reanudar
                      </button>
                    )}

                    {ad.status === 'pending' && (
                      <button
                        onClick={() => handleDelete(ad._id)}
                        className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Performance Modal */}
        {selectedAd && performance && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => {
              setSelectedAd(null);
              setPerformance(null);
            }}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Rendimiento: {selectedAd.title}
              </h2>

              <div className="space-y-6">
                {/* Performance Stats */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Estadísticas
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Impresiones
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {performance.performance.impressions?.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {performance.performance.impressionsPerDay} por día
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Clicks</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {performance.performance.clicks?.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {performance.performance.clicksPerDay} por día
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">CTR</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {performance.performance.ctr?.toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Costo Total
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        ${performance.cost.total}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Duración
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Total
                        </p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {performance.duration.totalDays} días
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Activos
                        </p>
                        <p className="text-xl font-bold text-green-600 dark:text-green-400">
                          {performance.duration.daysActive} días
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Restantes
                        </p>
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {performance.duration.daysRemaining} días
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost Analysis */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Análisis de Costos
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Costo por día:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${performance.cost.perDay}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Costo por impresión:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${performance.cost.costPerImpression}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Costo por click:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${performance.cost.costPerClick}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedAd(null);
                    setPerformance(null);
                  }}
                  className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvertisementManager;
