import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  DollarSign,
  TrendingUp,
  Lock,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Filter,
  Download,
  Search,
  X,
  BarChart3
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";

interface Transaction {
  id: string;
  date: string;
  type: string;
  status: string;
  totalAmount: number;
  currency: string;
  platformFee: number;
  platformFeePercentage: number;
  contract: {
    id: string;
    title: string;
    price: number;
    currency: string;
    commission: number;
    status: string;
    client: { name: string; email: string };
    doer: { name: string; email: string };
  } | null;
  payer: { name: string; email: string };
  recipient: { name: string; email: string } | null;
  isEscrow: boolean;
  escrowReleased: boolean;
  description: string;
}

type ChartType = 'escrow' | 'recent' | 'commissions' | 'total' | null;

export default function FinancialTransactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [selectedChart, setSelectedChart] = useState<ChartType>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    search: ''
  });

  useEffect(() => {
    loadTransactions();
    loadStats();
  }, [page, filters]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(filters.type !== 'all' && { type: filters.type }),
        ...(filters.status !== 'all' && { status: filters.status })
      });

      const response = await fetch(`/api/admin/company-balance/transactions?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setPagination(data.data.pagination);
      }
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch('/api/admin/company-balance/transaction-stats', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadChartData = async (chartType: ChartType) => {
    if (!chartType) return;

    setChartLoading(true);
    try {
      const token = localStorage.getItem("token");

      // Simulate chart data based on type
      // In a real scenario, you would fetch this from the backend
      let data: any = null;

      switch (chartType) {
        case 'escrow':
          // Escrow status distribution
          data = {
            pieData: [
              { name: 'En Escrow', value: stats.escrow?.held || 0, color: '#3b82f6' },
              { name: 'Liberados', value: (stats.escrow?.totals?.[0]?.total || 0) - (stats.escrow?.held || 0), color: '#10b981' }
            ],
            trend: generateTrendData('Escrow', 30)
          };
          break;

        case 'recent':
          // Last 30 days trend
          data = {
            lineData: generateTrendData('Transacciones', 30),
            barData: generateTransactionTypeData()
          };
          break;

        case 'commissions':
          // Commissions breakdown
          data = {
            areaData: generateTrendData('Comisiones', 30),
            pieData: [
              { name: 'Contratos (8%)', value: 8, color: '#8b5cf6' },
              { name: 'PRO (3%)', value: 3, color: '#3b82f6' },
              { name: 'SUPER PRO (2%)', value: 2, color: '#10b981' }
            ]
          };
          break;

        case 'total':
          // Total transactions over time
          data = {
            barData: generateMonthlyTransactions(),
            statusData: [
              { name: 'Completados', value: pagination?.total ? Math.floor(pagination.total * 0.7) : 0, color: '#10b981' },
              { name: 'En Escrow', value: stats.escrow?.held || 0, color: '#3b82f6' },
              { name: 'Pendientes', value: pagination?.total ? Math.floor(pagination.total * 0.1) : 0, color: '#f59e0b' },
              { name: 'Fallidos', value: pagination?.total ? Math.floor(pagination.total * 0.05) : 0, color: '#ef4444' }
            ]
          };
          break;
      }

      setChartData(data);
    } catch (error) {
      console.error("Error loading chart data:", error);
    } finally {
      setChartLoading(false);
    }
  };

  // Helper functions to generate mock data
  const generateTrendData = (name: string, days: number) => {
    const data = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        value: Math.floor(Math.random() * 50) + 10,
        name
      });
    }
    return data;
  };

  const generateTransactionTypeData = () => {
    return [
      { name: 'Contratos', value: 45 },
      { name: 'Membresías', value: 15 },
      { name: 'Publicaciones', value: 8 },
      { name: 'Escrow', value: 32 }
    ];
  };

  const generateMonthlyTransactions = () => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const currentMonth = new Date().getMonth();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      data.push({
        month: months[monthIndex],
        transactions: Math.floor(Math.random() * 100) + 20
      });
    }
    return data;
  };

  const handleCardClick = (chartType: ChartType) => {
    setSelectedChart(chartType);
    loadChartData(chartType);
  };

  const closeModal = () => {
    setSelectedChart(null);
    setChartData(null);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', icon: Clock },
      held_escrow: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400', icon: Lock },
      completed: { color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle },
      released: { color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle },
      failed: { color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', icon: XCircle },
      refunded: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400', icon: ArrowRight }
    };

    const badge = badges[status as keyof typeof badges] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const types: Record<string, string> = {
      contract_payment: 'Contrato',
      membership: 'Membresía',
      job_publication: 'Publicación',
      escrow_deposit: 'Escrow',
      escrow_release: 'Liberación'
    };

    return (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
        {types[type] || type}
      </span>
    );
  };

  const getChartTitle = () => {
    const titles = {
      escrow: 'Análisis de Pagos en Escrow',
      recent: 'Transacciones - Últimos 30 Días',
      commissions: 'Análisis de Comisiones',
      total: 'Análisis de Total de Transacciones'
    };
    return titles[selectedChart as keyof typeof titles] || '';
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (loading && transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Movimientos Financieros</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Historial completo de transacciones y comisiones
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => handleCardClick('escrow')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Lock className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">{stats.escrow?.held || 0}</h3>
            <p className="text-sm opacity-90">Pagos en Escrow</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>

          <button
            onClick={() => handleCardClick('recent')}
            className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">{stats.recent?.transactions || 0}</h3>
            <p className="text-sm opacity-90">Últimos 30 días</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>

          <button
            onClick={() => handleCardClick('commissions')}
            className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">
              ${stats.recent?.revenue?.toLocaleString() || 0}
            </h3>
            <p className="text-sm opacity-90">Comisiones (30d)</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>

          <button
            onClick={() => handleCardClick('total')}
            className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">{pagination?.total || 0}</h3>
            <p className="text-sm opacity-90">Total Transacciones</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>
        </div>
      )}

      {/* Chart Modal */}
      {selectedChart && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                {getChartTitle()}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="h-6 w-6 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {chartLoading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
                </div>
              ) : chartData ? (
                <div className="space-y-8">
                  {/* Escrow Charts */}
                  {selectedChart === 'escrow' && chartData.pieData && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución de Pagos en Escrow
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData.pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${entry.value}`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.pieData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Tendencia de Escrow (Últimos 30 días)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={chartData.trend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} name="Escrow" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}

                  {/* Recent Transactions Charts */}
                  {selectedChart === 'recent' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Transacciones Diarias (Últimos 30 días)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartData.lineData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Transacciones" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución por Tipo de Transacción
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartData.barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#10b981" name="Cantidad" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}

                  {/* Commissions Charts */}
                  {selectedChart === 'commissions' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Comisiones Diarias (Últimos 30 días)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartData.areaData}>
                            <defs>
                              <linearGradient id="colorCommission" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="value" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorCommission)" name="Comisiones ($)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución de Tasas de Comisión
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData.pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${entry.value}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.pieData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}

                  {/* Total Transactions Charts */}
                  {selectedChart === 'total' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Transacciones Mensuales
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartData.barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="transactions" fill="#f97316" name="Transacciones" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución por Estado
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData.statusData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${entry.value}`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.statusData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                  No hay datos disponibles
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tipo
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">Todos</option>
              <option value="contract_payment">Contratos</option>
              <option value="membership">Membresías</option>
              <option value="job_publication">Publicaciones</option>
              <option value="escrow_deposit">Escrow</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="held_escrow">En Escrow</option>
              <option value="completed">Completado</option>
              <option value="released">Liberado</option>
              <option value="failed">Fallido</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Doer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monto Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Comisión
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Liberado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {new Date(transaction.date).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getTypeBadge(transaction.type)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {transaction.contract ? (
                        <p className="font-medium">{transaction.contract.title}</p>
                      ) : (
                        <p>{transaction.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      {transaction.contract?.client ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.contract.client.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.contract.client.email}</p>
                        </>
                      ) : transaction.payer ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.payer.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.payer.email}</p>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      {transaction.contract?.doer ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.contract.doer.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.contract.doer.email}</p>
                        </>
                      ) : transaction.recipient ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.recipient.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.recipient.email}</p>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    <div>
                      <p className="font-bold">
                        {transaction.currency === 'USD' ? '$' : '$'}{transaction.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.currency}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <p className="font-medium text-green-600 dark:text-green-400">
                        {transaction.currency === 'USD' ? '$' : '$'}{transaction.platformFee.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {transaction.platformFeePercentage}%
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(transaction.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {transaction.isEscrow && (
                      transaction.escrowReleased ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <Lock className="w-5 h-5 text-blue-500 mx-auto" />
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Mostrando {((page - 1) * 50) + 1} - {Math.min(page * 50, pagination.total)} de {pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Anterior
              </button>
              <span className="px-3 py-1">
                Página {page} de {pagination.pages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.pages}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
