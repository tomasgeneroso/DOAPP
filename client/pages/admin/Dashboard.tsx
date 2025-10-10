import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { adminApi } from "@/lib/adminApi";
import type { AnalyticsOverview } from "@/types/admin";
import { Users, FileText, TicketIcon, TrendingUp } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
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
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
            <p className="text-sm font-medium text-gray-600">{stat.label}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.subtext}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {user?.adminRole !== "marketing" && (
            <>
              <a
                href="/admin/users"
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition"
              >
                <h3 className="font-semibold text-gray-900">Gestionar Usuarios</h3>
                <p className="text-sm text-gray-600 mt-1">Ver y administrar usuarios</p>
              </a>
              <a
                href="/admin/tickets"
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition"
              >
                <h3 className="font-semibold text-gray-900">Tickets de Soporte</h3>
                <p className="text-sm text-gray-600 mt-1">Resolver consultas y problemas</p>
              </a>
            </>
          )}
          <a
            href="/admin/analytics"
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition"
          >
            <h3 className="font-semibold text-gray-900">Analíticas</h3>
            <p className="text-sm text-gray-600 mt-1">Ver métricas y reportes</p>
          </a>
        </div>
      </div>
    </div>
  );
}
