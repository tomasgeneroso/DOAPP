import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import usePerformance, { clientPerformanceMonitor } from "../../hooks/usePerformance";
import {
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Server,
  Monitor,
  BarChart3,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ServerPerformance {
  summary: {
    uptime: number;
    totalRequests: number;
    requestsPerMinute: number;
    avgResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    slowRequestCount: number;
    healthScore: number;
  };
  topSlowRoutes: Array<{
    route: string;
    method: string;
    count: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    p50: number;
    p95: number;
    p99: number;
    errorRate: number;
    status: 'good' | 'warning' | 'critical';
    recommendation?: string;
  }>;
  recentSlowRequests: Array<{
    route: string;
    method: string;
    responseTime: number;
    statusCode: number;
    timestamp: string;
  }>;
  recommendations: string[];
  thresholds: {
    warningMs: number;
    criticalMs: number;
    targetP95Ms: number;
    targetP99Ms: number;
  };
}

interface TimelineData {
  timestamp: string;
  requests: number;
  avgResponseTime: number;
  errorRate: number;
}

export default function PerformanceMonitor() {
  const { token } = useAuth();
  const { getWebVitals, getApiStats, generateReport } = usePerformance();

  const [serverData, setServerData] = useState<ServerPerformance | null>(null);
  const [timeline, setTimeline] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'server' | 'client'>('server');
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchServerData = useCallback(async () => {
    if (!token) return;

    try {
      const [reportRes, timelineRes] = await Promise.all([
        fetch('/api/admin/performance/report', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/performance/timeline?interval=1&periods=60', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const [reportData, timelineData] = await Promise.all([
        reportRes.json(),
        timelineRes.json(),
      ]);

      if (reportData.success) {
        setServerData(reportData.data);
      }
      if (timelineData.success) {
        setTimeline(timelineData.data);
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching performance data:', err);
      setError('Error al cargar datos de rendimiento');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchServerData();
  }, [fetchServerData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchServerData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchServerData]);

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getHealthBg = (score: number): string => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'good': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      case 'critical': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/30';
    }
  };

  const getVitalColor = (score: string): string => {
    switch (score) {
      case 'good': return 'text-green-600 dark:text-green-400';
      case 'needs-improvement': return 'text-yellow-600 dark:text-yellow-400';
      case 'poor': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-400';
    }
  };

  const toggleRoute = (route: string) => {
    const newExpanded = new Set(expandedRoutes);
    if (newExpanded.has(route)) {
      newExpanded.delete(route);
    } else {
      newExpanded.add(route);
    }
    setExpandedRoutes(newExpanded);
  };

  // Client-side performance data
  const clientReport = generateReport();
  const webVitals = clientReport.webVitals;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Monitor de Rendimiento
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Métricas de rendimiento del servidor y cliente
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            <span className="text-slate-600 dark:text-slate-400">Auto-refresh (30s)</span>
          </label>
          <button
            onClick={fetchServerData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('server')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'server'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Server className="h-4 w-4" />
          Servidor
        </button>
        <button
          onClick={() => setActiveTab('client')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'client'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Monitor className="h-4 w-4" />
          Cliente (Web Vitals)
        </button>
      </div>

      {activeTab === 'server' && serverData && (
        <>
          {/* Server Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Health Score */}
            <div className={`rounded-xl p-5 ${getHealthBg(serverData.summary.healthScore)}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Health Score</span>
                <Activity className={`h-5 w-5 ${getHealthColor(serverData.summary.healthScore)}`} />
              </div>
              <p className={`text-3xl font-bold ${getHealthColor(serverData.summary.healthScore)}`}>
                {serverData.summary.healthScore}%
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Uptime: {formatUptime(serverData.summary.uptime)}
              </p>
            </div>

            {/* Response Times */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Tiempos de Respuesta</span>
                <Clock className="h-5 w-5 text-sky-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {serverData.summary.avgResponseTime}ms
              </p>
              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-slate-500">P50: {serverData.summary.p50ResponseTime}ms</span>
                <span className="text-slate-500">P95: {serverData.summary.p95ResponseTime}ms</span>
                <span className="text-slate-500">P99: {serverData.summary.p99ResponseTime}ms</span>
              </div>
            </div>

            {/* Requests */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Requests</span>
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {serverData.summary.totalRequests.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {serverData.summary.requestsPerMinute.toFixed(1)} req/min
              </p>
            </div>

            {/* Error Rate */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Error Rate</span>
                {serverData.summary.errorRate > 1 ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
              <p className={`text-3xl font-bold ${
                serverData.summary.errorRate > 1 ? 'text-red-600' : 'text-green-600'
              }`}>
                {serverData.summary.errorRate}%
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {serverData.summary.slowRequestCount} requests lentos
              </p>
            </div>
          </div>

          {/* Recommendations */}
          {serverData.recommendations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Recomendaciones
              </h3>
              <ul className="space-y-2">
                {serverData.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-sm text-amber-700 dark:text-amber-300">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Route Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-sky-600" />
                Rendimiento por Ruta (ordenado por P95)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Ruta</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Requests</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Avg</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">P50</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">P95</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">P99</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Errors</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {serverData.topSlowRoutes.map((route, idx) => (
                    <>
                      <tr
                        key={idx}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/30 cursor-pointer"
                        onClick={() => toggleRoute(route.route)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {expandedRoutes.has(route.route) ? (
                              <ChevronUp className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            )}
                            <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {route.method}
                            </span>
                            <span className="text-sm text-slate-900 dark:text-white font-mono">
                              {route.route}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {route.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {route.avgTime}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {route.p50}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium text-slate-900 dark:text-white">
                          {route.p95}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {route.p99}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          <span className={route.errorRate > 1 ? 'text-red-600' : 'text-green-600'}>
                            {route.errorRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(route.status)}`}>
                            {route.status === 'good' ? 'OK' : route.status === 'warning' ? 'Advertencia' : 'Crítico'}
                          </span>
                        </td>
                      </tr>
                      {expandedRoutes.has(route.route) && route.recommendation && (
                        <tr className="bg-amber-50 dark:bg-amber-900/10">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <span>{route.recommendation}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Slow Requests */}
          {serverData.recentSlowRequests.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Requests Lentos Recientes
                </h3>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2">Timestamp</th>
                      <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2">Ruta</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2">Tiempo</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {serverData.recentSlowRequests.slice(0, 10).map((req, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                        <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(req.timestamp).toLocaleString('es-AR')}
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-mono text-slate-900 dark:text-white">
                            {req.method} {req.route}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="text-xs font-medium text-red-600">
                            {Math.round(req.responseTime)}ms
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs ${req.statusCode >= 400 ? 'text-red-600' : 'text-green-600'}`}>
                            {req.statusCode}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'client' && (
        <>
          {/* Web Vitals Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* LCP */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">LCP (Largest Contentful Paint)</span>
              </div>
              <p className={`text-3xl font-bold ${getVitalColor(webVitals.scores.LCP)}`}>
                {webVitals.vitals.LCP !== null ? `${Math.round(webVitals.vitals.LCP)}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target: &lt;2500ms (good), &lt;4000ms (needs improvement)
              </p>
            </div>

            {/* FID */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">FID (First Input Delay)</span>
              </div>
              <p className={`text-3xl font-bold ${getVitalColor(webVitals.scores.FID)}`}>
                {webVitals.vitals.FID !== null ? `${Math.round(webVitals.vitals.FID)}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target: &lt;100ms (good), &lt;300ms (needs improvement)
              </p>
            </div>

            {/* CLS */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">CLS (Cumulative Layout Shift)</span>
              </div>
              <p className={`text-3xl font-bold ${getVitalColor(webVitals.scores.CLS)}`}>
                {webVitals.vitals.CLS !== null ? webVitals.vitals.CLS.toFixed(3) : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target: &lt;0.1 (good), &lt;0.25 (needs improvement)
              </p>
            </div>

            {/* FCP */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">FCP (First Contentful Paint)</span>
              </div>
              <p className={`text-3xl font-bold ${getVitalColor(webVitals.scores.FCP)}`}>
                {webVitals.vitals.FCP !== null ? `${Math.round(webVitals.vitals.FCP)}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target: &lt;1800ms (good), &lt;3000ms (needs improvement)
              </p>
            </div>

            {/* TTFB */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">TTFB (Time to First Byte)</span>
              </div>
              <p className={`text-3xl font-bold ${getVitalColor(webVitals.scores.TTFB)}`}>
                {webVitals.vitals.TTFB !== null ? `${Math.round(webVitals.vitals.TTFB)}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target: &lt;800ms (good), &lt;1800ms (needs improvement)
              </p>
            </div>

            {/* INP */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">INP (Interaction to Next Paint)</span>
              </div>
              <p className={`text-3xl font-bold ${getVitalColor(webVitals.scores.INP)}`}>
                {webVitals.vitals.INP !== null ? `${Math.round(webVitals.vitals.INP)}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target: &lt;200ms (good), &lt;500ms (needs improvement)
              </p>
            </div>
          </div>

          {/* Overall Score */}
          <div className={`rounded-xl p-6 ${getHealthBg(webVitals.overallScore)}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Puntuación General de Web Vitals
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Basado en las métricas Core Web Vitals de Google
                </p>
              </div>
              <p className={`text-5xl font-bold ${getHealthColor(webVitals.overallScore)}`}>
                {webVitals.overallScore}%
              </p>
            </div>
          </div>

          {/* Client Recommendations */}
          {clientReport.recommendations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Recomendaciones del Cliente
              </h3>
              <ul className="space-y-2">
                {clientReport.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-sm text-amber-700 dark:text-amber-300">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* API Stats from Client */}
          {clientReport.apiStats.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  Rendimiento de API (desde el cliente)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Endpoint</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Calls</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Avg</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Min</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Max</th>
                      <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-3">P95</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {clientReport.apiStats.slice(0, 15).map((stat, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                        <td className="px-4 py-3 text-sm font-mono text-slate-900 dark:text-white">
                          {stat.endpoint}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {stat.count}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {stat.avgTime}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {stat.minTime}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">
                          {stat.maxTime}ms
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium">
                          <span className={stat.p95 > 2000 ? 'text-red-600' : stat.p95 > 1000 ? 'text-yellow-600' : 'text-green-600'}>
                            {stat.p95}ms
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
