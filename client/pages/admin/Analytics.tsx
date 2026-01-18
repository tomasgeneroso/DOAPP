import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  Users,
  FileText,
  DollarSign,
  Activity,
  AlertCircle,
  BarChart3,
  PieChart,
  ChevronRight,
  Ticket,
  Trophy,
} from "lucide-react";

interface Stats {
  users: {
    total: number;
    active: number;
    banned: number;
    avgTrustScore: number;
  };
  contracts: {
    total: number;
    completed: number;
    completionRate: number;
  };
  tickets: {
    total: number;
    open: number;
  };
}

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/analytics/overview?period=${period}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Métricas y estadísticas de la plataforma
          </p>
        </div>

        {/* Period Selector */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="90d">Últimos 90 días</option>
        </select>
      </div>

      {/* Stats Grid */}
      {stats && (
        <>
          {/* Users Stats */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-600" />
              Usuarios
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Usuarios</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {stats.users.total.toLocaleString()}
                    </p>
                  </div>
                  <Users className="h-10 w-10 text-sky-600" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Usuarios Activos</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {stats.users.active.toLocaleString()}
                    </p>
                  </div>
                  <Activity className="h-10 w-10 text-green-600" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Usuarios Baneados</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                      {stats.users.banned.toLocaleString()}
                    </p>
                  </div>
                  <AlertCircle className="h-10 w-10 text-red-600" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Trust Score Prom.</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {stats.users.avgTrustScore.toFixed(1)}
                    </p>
                  </div>
                  <TrendingUp className="h-10 w-10 text-sky-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Contracts Stats */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-600" />
              Contratos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Contratos</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {stats.contracts.total.toLocaleString()}
                    </p>
                  </div>
                  <FileText className="h-10 w-10 text-sky-600" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Completados</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {stats.contracts.completed.toLocaleString()}
                    </p>
                  </div>
                  <BarChart3 className="h-10 w-10 text-green-600" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Tasa de Completitud</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {stats.contracts.completionRate.toFixed(1)}%
                    </p>
                  </div>
                  <PieChart className="h-10 w-10 text-sky-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Tickets Stats */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-sky-600" />
              Soporte
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Tickets</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {stats.tickets.total.toLocaleString()}
                    </p>
                  </div>
                  <FileText className="h-10 w-10 text-sky-600" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Tickets Abiertos</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                      {stats.tickets.open.toLocaleString()}
                    </p>
                  </div>
                  <AlertCircle className="h-10 w-10 text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Analytics Links */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-sky-600" />
              Análisis Detallado
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/admin/analytics/users"
                className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg p-6 text-white transition-all transform hover:scale-105 shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <Users className="h-10 w-10" />
                  <ChevronRight className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold mb-1">Métricas de Usuarios</h3>
                <p className="text-sm text-blue-100">
                  Gráficos, tendencias y análisis detallado de usuarios
                </p>
              </Link>

              <Link
                to="/admin/analytics/contracts"
                className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-lg p-6 text-white transition-all transform hover:scale-105 shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <FileText className="h-10 w-10" />
                  <ChevronRight className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold mb-1">Métricas de Contratos</h3>
                <p className="text-sm text-green-100">
                  Análisis de contratos, ingresos y tasas de completitud
                </p>
              </Link>

              <Link
                to="/admin/analytics/tickets"
                className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg p-6 text-white transition-all transform hover:scale-105 shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <Ticket className="h-10 w-10" />
                  <ChevronRight className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold mb-1">Métricas de Tickets</h3>
                <p className="text-sm text-orange-100">
                  Análisis de soporte, categorías y tiempos de resolución
                </p>
              </Link>

              <Link
                to="/admin/analytics/user-activity"
                className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-lg p-6 text-white transition-all transform hover:scale-105 shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <Trophy className="h-10 w-10" />
                  <ChevronRight className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold mb-1">Actividad por Usuario</h3>
                <p className="text-sm text-purple-100">
                  Rankings de disputas, tickets, contratos y pagos por usuario
                </p>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
