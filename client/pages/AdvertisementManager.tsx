import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyAdvertisements } from '@/hooks/useAdvertisements';

const AdvertisementManager: React.FC = () => {
  const { t } = useTranslation();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (confirm(t('ads.confirmPause', 'Pause this advertisement?'))) {
      try {
        await pauseAd(adId);
      } catch (err) {
        alert(t('ads.pauseError', 'Error pausing advertisement'));
      }
    }
  };

  const handleResume = async (adId: string) => {
    if (confirm(t('ads.confirmResume', 'Resume this advertisement?'))) {
      try {
        await resumeAd(adId);
      } catch (err) {
        alert(t('ads.resumeError', 'Error resuming advertisement'));
      }
    }
  };

  const handleDelete = async (adId: string) => {
    if (confirm(t('ads.confirmDelete', 'Delete this advertisement? This action cannot be undone.'))) {
      try {
        await deleteAd(adId);
      } catch (err) {
        alert(t('ads.deleteError', 'Error deleting advertisement'));
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: t('ads.status.pending', 'Pending') },
      active: { bg: 'bg-green-100', text: 'text-green-800', label: t('ads.status.active', 'Active') },
      paused: { bg: 'bg-gray-100', text: 'text-gray-800', label: t('ads.status.paused', 'Paused') },
      expired: { bg: 'bg-red-100', text: 'text-red-800', label: t('ads.status.expired', 'Expired') },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: t('ads.status.rejected', 'Rejected') },
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
            {t('ads.manager', 'Advertisement Manager')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('ads.managerDesc', 'Manage your advertising campaigns and see their performance')}
          </p>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {t('ads.totalAds', 'Total Ads')}
              </h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalAds}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {t('ads.activeAds', 'Active')}
              </h3>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {stats.activeAds}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {t('ads.totalImpressions', 'Total Impressions')}
              </h3>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {stats.totalImpressions?.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {t('ads.totalClicks', 'Total Clicks')}
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
            <option value="">{t('ads.allStatuses', 'All statuses')}</option>
            <option value="active">{t('ads.filter.active', 'Active')}</option>
            <option value="pending">{t('ads.filter.pending', 'Pending')}</option>
            <option value="paused">{t('ads.filter.paused', 'Paused')}</option>
            <option value="expired">{t('ads.filter.expired', 'Expired')}</option>
            <option value="rejected">{t('ads.filter.rejected', 'Rejected')}</option>
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
              {t('ads.noAds', 'You have no advertisements')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('ads.createFirst', 'Create your first advertising campaign')}
            </p>
            <button className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-colors">
              {t('ads.createAd', 'Create Advertisement')}
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
                        {t('ads.impressions', 'Impressions')}
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {ad.impressions}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('ads.clicks', 'Clicks')}</p>
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
                      <span className="text-gray-500 dark:text-gray-400">{t('ads.type', 'Type')}:</span>
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
                      {t('ads.viewPerformance', 'View Performance')}
                    </button>

                    {ad.status === 'active' && (
                      <button
                        onClick={() => handlePause(ad._id)}
                        className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors"
                      >
                        {t('ads.pause', 'Pause')}
                      </button>
                    )}

                    {ad.status === 'paused' && (
                      <button
                        onClick={() => handleResume(ad._id)}
                        className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
                      >
                        {t('ads.resume', 'Resume')}
                      </button>
                    )}

                    {ad.status === 'pending' && (
                      <button
                        onClick={() => handleDelete(ad._id)}
                        className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
                      >
                        {t('ads.delete', 'Delete')}
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
                {t('ads.performanceTitle', 'Performance')}: {selectedAd.title}
              </h2>

              <div className="space-y-6">
                {/* Performance Stats */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    {t('ads.statistics', 'Statistics')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('ads.impressions', 'Impressions')}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {performance.performance.impressions?.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {performance.performance.impressionsPerDay} {t('ads.perDay', 'per day')}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('ads.clicks', 'Clicks')}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {performance.performance.clicks?.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {performance.performance.clicksPerDay} {t('ads.perDay', 'per day')}
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
                        {t('ads.totalCost', 'Total Cost')}
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
                    {t('ads.duration', 'Duration')}
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t('ads.total', 'Total')}
                        </p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {performance.duration.totalDays} {t('ads.days', 'days')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t('ads.activeDays', 'Active')}
                        </p>
                        <p className="text-xl font-bold text-green-600 dark:text-green-400">
                          {performance.duration.daysActive} {t('ads.days', 'days')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t('ads.remaining', 'Remaining')}
                        </p>
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {performance.duration.daysRemaining} {t('ads.days', 'days')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost Analysis */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    {t('ads.costAnalysis', 'Cost Analysis')}
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('ads.costPerDay', 'Cost per day')}:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${performance.cost.perDay}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('ads.costPerImpression', 'Cost per impression')}:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${performance.cost.costPerImpression}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('ads.costPerClick', 'Cost per click')}:
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
                  {t('common.close', 'Close')}
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
