import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { adminApi } from "@/lib/adminApi";
import type { AnalyticsOverview } from "@/types/admin";
import { Users, FileText, TicketIcon, TrendingUp, Plus, AlertTriangle, DollarSign, CreditCard, Wallet, BarChart3, Crown, Star } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [companyBalance, setCompanyBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
    if (user?.adminRole === "owner") {
      loadCompanyBalance();
    }
  }, []);

  const loadOverview = async () => {
    try {
      const res = await adminApi.analytics.overview();
      if (res.success && res.data) {
        setOverview(res.data);
      }
    } catch (error) {
      console.error("Error loading overview:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyBalance = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch('/api/admin/company-balance/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setCompanyBalance(data);
      }
    } catch (error) {
      console.error("Error loading company balance:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  const stats = [
    {
      label: "Total Usuarios",
      value: overview?.users.total || 0,
      subtext: `${overview?.users.active || 0} activos`,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      label: "Contratos",
      value: overview?.contracts.total || 0,
      subtext: `${overview?.contracts.completionRate.toFixed(1)}% completados`,
      icon: FileText,
      color: "bg-green-500",
    },
    {
      label: "Tickets",
      value: overview?.tickets.total || 0,
      subtext: `${overview?.tickets.open || 0} abiertos`,
      icon: TicketIcon,
      color: "bg-yellow-500",
    },
    {
      label: "Trust Score Promedio",
      value: overview?.users.avgTrustScore.toFixed(1) || 0,
      subtext: "De 100",
      icon: TrendingUp,
      color: "bg-purple-500",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Bienvenido, <span className="font-semibold">{user?.name}</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</h3>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{stat.subtext}</p>
          </div>
        ))}
      </div>

      {/* Company Balance Section - Solo para Owner */}
      {user?.adminRole === "owner" && companyBalance && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Saldo de la Empresa</h2>

          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Saldo Neto ARS */}
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <Wallet className="h-8 w-8" />
                <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full">ARS</span>
              </div>
              <h3 className="text-3xl font-bold mb-2">
                ${companyBalance.netBalance?.ARS?.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </h3>
              <p className="text-sm opacity-90">Saldo Neto (Pesos)</p>
            </div>

            {/* Saldo Neto USD */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <DollarSign className="h-8 w-8" />
                <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full">USD</span>
              </div>
              <h3 className="text-3xl font-bold mb-2">
                ${companyBalance.netBalance?.USD?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </h3>
              <p className="text-sm opacity-90">Saldo Neto (Dólares)</p>
            </div>

            {/* Membresías Activas */}
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <CreditCard className="h-8 w-8" />
              </div>
              <h3 className="text-3xl font-bold mb-2">
                {companyBalance.revenue?.memberships?.activeCount || 0}
              </h3>
              <p className="text-sm opacity-90">
                Membresías Activas
              </p>
              <p className="text-xs opacity-75 mt-2">
                {companyBalance.revenue?.memberships?.proCount || 0} PRO + {companyBalance.revenue?.memberships?.superProCount || 0} SUPER PRO
              </p>
            </div>
          </div>

          {/* Revenue Breakdown - Full Width */}
          <div className="grid grid-cols-1 gap-6">
            {/* Comisiones de Contratos - Mejorado con gráficos */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Comisiones de Contratos
              </h3>

              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total ARS</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                    ${Number(companyBalance.revenue?.commissions?.totalARS || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Este Mes (ARS)</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    ${Number(companyBalance.revenue?.commissions?.monthlyARS || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Crecimiento</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {Number(companyBalance.revenue?.commissions?.totalARS || 0) > 0
                      ? `${((Number(companyBalance.revenue?.commissions?.monthlyARS || 0) / Number(companyBalance.revenue?.commissions?.totalARS || 1)) * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">del mes actual</p>
                </div>
              </div>

              {/* Gráfico de tasas de comisión */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  Estructura de Comisiones por Tipo de Usuario
                </h4>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={[
                      { tipo: 'Estándar', comision: 8, color: '#ef4444' },
                      { tipo: 'PRO', comision: 3, color: '#8b5cf6' },
                      { tipo: 'SUPER PRO', comision: 2, color: '#f59e0b' },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="tipo" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} domain={[0, 10]} unit="%" />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, 'Comisión']}
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                      labelStyle={{ color: '#f3f4f6' }}
                    />
                    <Bar dataKey="comision" radius={[4, 4, 0, 0]}>
                      <Cell fill="#ef4444" />
                      <Cell fill="#8b5cf6" />
                      <Cell fill="#f59e0b" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                  Contratos menores a $8000 ARS tienen comisión mínima de $1000 ARS
                </p>
              </div>
            </div>

            {/* Ingresos por Membresías - Versión mejorada con gráficos */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-purple-600" />
                Ingresos por Membresías
              </h3>

              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total ARS</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                    ${Number(companyBalance.revenue?.memberships?.totalARS || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total USD</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    ${Number(companyBalance.revenue?.memberships?.totalUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Este Mes (ARS)</p>
                  <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">
                    ${Number(companyBalance.revenue?.memberships?.monthlyARS || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Este Mes (USD)</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    ${Number(companyBalance.revenue?.memberships?.monthlyUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Gráficos de membresías */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribución por tipo de membresía */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                    <Crown className="h-4 w-4 text-yellow-500" />
                    Distribución de Membresías Activas
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: 'PRO',
                            value: companyBalance.revenue?.memberships?.proCount || 0,
                            color: '#8b5cf6',
                            price: '€5.99/mes'
                          },
                          {
                            name: 'SUPER PRO',
                            value: companyBalance.revenue?.memberships?.superProCount || 0,
                            color: '#f59e0b',
                            price: '€8.99/mes'
                          },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value, percent }: any) => Number(value) > 0 ? `${name}: ${value} (${(Number(percent) * 100).toFixed(0)}%)` : ''}
                        outerRadius={70}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#8b5cf6" />
                        <Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [value, name]}
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        labelStyle={{ color: '#f3f4f6' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-6 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">PRO ({companyBalance.revenue?.memberships?.proCount || 0})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">SUPER PRO ({companyBalance.revenue?.memberships?.superProCount || 0})</span>
                    </div>
                  </div>
                </div>

                {/* Ingresos estimados por tipo */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                    <Star className="h-4 w-4 text-green-500" />
                    Ingresos Mensuales Estimados por Tipo
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={[
                        {
                          name: 'PRO',
                          ingresos: (companyBalance.revenue?.memberships?.proCount || 0) * 5.99,
                          cantidad: companyBalance.revenue?.memberships?.proCount || 0
                        },
                        {
                          name: 'SUPER PRO',
                          ingresos: (companyBalance.revenue?.memberships?.superProCount || 0) * 8.99,
                          cantidad: companyBalance.revenue?.memberships?.superProCount || 0
                        },
                      ]}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={80} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'ingresos') return [`€${value.toFixed(2)}`, 'Ingresos/mes'];
                          return [value, 'Cantidad'];
                        }}
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        labelStyle={{ color: '#f3f4f6' }}
                      />
                      <Bar dataKey="ingresos" fill="#10b981" name="ingresos" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                    <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-3">
                      <p className="text-xs text-gray-600 dark:text-gray-400">PRO (€5.99/mes)</p>
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-400">
                        €{((companyBalance.revenue?.memberships?.proCount || 0) * 5.99).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-amber-100 dark:bg-amber-900/30 rounded-lg p-3">
                      <p className="text-xs text-gray-600 dark:text-gray-400">SUPER PRO (€8.99/mes)</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                        €{((companyBalance.revenue?.memberships?.superProCount || 0) * 8.99).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen total */}
              <div className="mt-4 bg-gradient-to-r from-purple-500/10 to-amber-500/10 dark:from-purple-900/30 dark:to-amber-900/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Ingreso Mensual Estimado Total (EUR)</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-amber-600 bg-clip-text text-transparent">
                      €{(
                        ((companyBalance.revenue?.memberships?.proCount || 0) * 5.99) +
                        ((companyBalance.revenue?.memberships?.superProCount || 0) * 8.99)
                      ).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Membresías Activas</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {companyBalance.revenue?.memberships?.activeCount || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ingresos por Publicidad - Mejorado con gráficos */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-orange-600" />
                Ingresos por Publicidad
              </h3>

              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total ARS</p>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                    ${Number(companyBalance.revenue?.advertisements?.totalARS || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total USD</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    ${Number(companyBalance.revenue?.advertisements?.totalUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Promotores Activos</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {companyBalance.revenue?.advertisements?.activePromotersCount || 0}
                  </p>
                </div>
              </div>

              {/* Gráfico de modelos de publicidad */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  Modelos de Publicidad Disponibles
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={[
                      { modelo: 'Banner 3x1', precio: 50, color: '#f97316' },
                      { modelo: 'Sidebar 1x2', precio: 35, color: '#3b82f6' },
                      { modelo: 'Card 1x1', precio: 20, color: '#10b981' },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="modelo" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} unit="$/día" />
                    <Tooltip
                      formatter={(value: number) => [`$${value}/día`, 'Precio Base']}
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                      labelStyle={{ color: '#f3f4f6' }}
                    />
                    <Bar dataKey="precio" radius={[4, 4, 0, 0]}>
                      <Cell fill="#f97316" />
                      <Cell fill="#3b82f6" />
                      <Cell fill="#10b981" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-orange-100 dark:bg-orange-900/30 rounded p-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Banner 3x1</p>
                    <p className="text-sm font-bold text-orange-600">$50/día</p>
                  </div>
                  <div className="bg-blue-100 dark:bg-blue-900/30 rounded p-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Sidebar 1x2</p>
                    <p className="text-sm font-bold text-blue-600">$35/día</p>
                  </div>
                  <div className="bg-green-100 dark:bg-green-900/30 rounded p-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Card 1x1</p>
                    <p className="text-sm font-bold text-green-600">$20/día</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
                  Fórmula: base × días × (1 + prioridad × 0.1)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Section */}
      {(user?.adminRole === "owner" || user?.adminRole === "super_admin" || user?.adminRole === "admin" || user?.adminRole === "marketing") && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Analíticas Detalladas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Analytics General */}
            <Link
              to="/admin/analytics"
              className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg p-6 transition-all transform hover:scale-105 shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <BarChart3 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold mb-1">Analytics General</h3>
              <p className="text-sm text-blue-100">Vista general de todas las métricas</p>
            </Link>

            {/* Analytics de Usuarios */}
            <Link
              to="/admin/analytics/users"
              className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg p-6 transition-all transform hover:scale-105 shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <Users className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold mb-1">Usuarios</h3>
              <p className="text-sm text-purple-100">Análisis de usuarios y actividad</p>
            </Link>

            {/* Analytics de Contratos */}
            <Link
              to="/admin/analytics/contracts"
              className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg p-6 transition-all transform hover:scale-105 shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <FileText className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold mb-1">Contratos</h3>
              <p className="text-sm text-green-100">Métricas de contratos y pagos</p>
            </Link>

            {/* Analytics de Tickets */}
            <Link
              to="/admin/analytics/tickets"
              className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg p-6 transition-all transform hover:scale-105 shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <TicketIcon className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold mb-1">Tickets</h3>
              <p className="text-sm text-orange-100">Análisis de soporte y tickets</p>
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(user?.adminRole === "owner" || user?.adminRole === "super_admin" || user?.adminRole === "admin") && (
            <>
              <Link
                to="/admin/users"
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">Gestionar Usuarios</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ver y administrar usuarios</p>
              </Link>
              <Link
                to="/admin/contracts"
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">Gestionar Contratos</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ver y administrar contratos</p>
              </Link>
              <Link
                to="/admin/disputes"
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">Gestionar Disputas</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Resolver disputas de contratos</p>
              </Link>
            </>
          )}
          {(user?.adminRole === "owner" || user?.adminRole === "super_admin" || user?.adminRole === "admin" || user?.adminRole === "support") && (
            <Link
              to="/admin/tickets"
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white">Tickets de Soporte</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Resolver consultas y problemas</p>
            </Link>
          )}
          {(user?.adminRole === "owner" || user?.adminRole === "super_admin" || user?.adminRole === "admin") && (
            <>
              <Link
                to="/admin/withdrawals"
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">Gestionar Retiros</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Aprobar y procesar retiros</p>
              </Link>
              <Link
                to="/admin/pending-payments"
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">Pagos Pendientes</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Verificar y aprobar comprobantes de pago</p>
              </Link>
              <Link
                to="/admin/financial-transactions"
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">Movimientos Financieros</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ver transacciones y comisiones</p>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Admin Actions for Tickets and Disputes */}
      {(user?.adminRole === "owner" || user?.adminRole === "super_admin" || user?.adminRole === "admin" || user?.adminRole === "support") && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Crear en Nombre de Usuario
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/admin/tickets/create"
              className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all transform hover:scale-105 shadow-lg flex items-center gap-3"
            >
              <div className="bg-white/20 p-3 rounded-lg">
                <Plus className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">Crear Ticket</h3>
                <p className="text-sm text-blue-100">
                  Crear ticket de soporte en nombre de un usuario
                </p>
              </div>
              <TicketIcon className="h-8 w-8 opacity-50" />
            </Link>

            <Link
              to="/admin/disputes/create"
              className="p-4 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg transition-all transform hover:scale-105 shadow-lg flex items-center gap-3"
            >
              <div className="bg-white/20 p-3 rounded-lg">
                <Plus className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">Crear Disputa</h3>
                <p className="text-sm text-orange-100">
                  Crear disputa en nombre de un usuario
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 opacity-50" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
