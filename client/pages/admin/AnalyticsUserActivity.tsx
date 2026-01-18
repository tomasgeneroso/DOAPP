import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { Link } from "react-router-dom";
import {
  Users,
  AlertTriangle,
  FileText,
  Briefcase,
  CreditCard,
  Trophy,
  Eye,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  adminRole?: string;
}

interface ActivityItem {
  user?: UserInfo;
  admin?: UserInfo;
  count: number;
  totalValue?: number;
  totalAmount?: number;
}

interface UserActivityData {
  period: string;
  dateLimit: string;
  disputes: {
    opened: ActivityItem[];
    resolved: ActivityItem[];
  };
  tickets: {
    created: ActivityItem[];
    resolved: ActivityItem[];
  };
  contracts: {
    createdByClient: ActivityItem[];
    completedByDoer: ActivityItem[];
  };
  payments: {
    released: ActivityItem[];
  };
  jobs: {
    created: ActivityItem[];
  };
}

const COLORS = {
  disputes: "text-red-500 bg-red-100 dark:bg-red-900/20",
  tickets: "text-orange-500 bg-orange-100 dark:bg-orange-900/20",
  contracts: "text-blue-500 bg-blue-100 dark:bg-blue-900/20",
  payments: "text-green-500 bg-green-100 dark:bg-green-900/20",
  jobs: "text-purple-500 bg-purple-100 dark:bg-purple-900/20",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function UserAvatar({ user }: { user?: UserInfo }) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 min-w-0">
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-gray-600 dark:text-gray-300">
            {user.name?.charAt(0).toUpperCase() || "?"}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white truncate">
          {user.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {user.email}
        </p>
      </div>
    </div>
  );
}

function RankingCard({
  title,
  icon: Icon,
  colorClass,
  items,
  valueLabel,
  showValue = false,
  valueKey = "totalValue",
}: {
  title: string;
  icon: any;
  colorClass: string;
  items: ActivityItem[];
  valueLabel?: string;
  showValue?: boolean;
  valueKey?: "totalValue" | "totalAmount";
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No hay datos para mostrar
        </p>
      ) : (
        <div className="space-y-3 max-h-[350px] overflow-y-auto">
          {items.map((item, index) => {
            const userInfo = item.user || item.admin;
            return (
              <div
                key={userInfo?.id || index}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex-shrink-0 w-7 h-7 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                    #{index + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <UserAvatar user={userInfo} />
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    <span className="font-bold text-gray-900 dark:text-white">
                      {item.count}
                    </span>
                  </div>
                  {showValue && item[valueKey] ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatCurrency(item[valueKey] as number)}
                    </p>
                  ) : null}
                </div>
                {userInfo && (
                  <Link
                    to={`/admin/analytics/user/${userInfo.id}`}
                    className="text-sky-500 hover:text-sky-600 flex-shrink-0"
                    title="Ver actividad del usuario"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsUserActivity() {
  const [data, setData] = useState<UserActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await adminApi.analytics.userActivity(period, 15);
      if (response.success && response.data) {
        setData(response.data);
      }
    } catch (error) {
      console.error("Error loading user activity:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        No se pudieron cargar las métricas de actividad
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Actividad por Usuario
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Rankings de usuarios por actividad en la plataforma
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2">
          {["7d", "30d", "90d", "365d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                period === p
                  ? "bg-sky-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {p === "7d"
                ? "7 dias"
                : p === "30d"
                ? "30 dias"
                : p === "90d"
                ? "90 dias"
                : "1 ano"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Disputas abiertas
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {data.disputes.opened.reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Disputas resueltas
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {data.disputes.resolved.reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Tickets creados
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {data.tickets.created.reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Tickets resueltos
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {data.tickets.resolved.reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Contratos creados
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {data.contracts.createdByClient.reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Pagos liberados
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {data.payments.released.reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
      </div>

      {/* Disputes Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Disputas
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankingCard
            title="Usuarios que mas abrieron disputas"
            icon={AlertTriangle}
            colorClass={COLORS.disputes}
            items={data.disputes.opened}
          />
          <RankingCard
            title="Admins que mas resolvieron disputas"
            icon={AlertTriangle}
            colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
            items={data.disputes.resolved}
          />
        </div>
      </div>

      {/* Tickets Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-orange-500" />
          Tickets de Soporte
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankingCard
            title="Usuarios que mas crearon tickets"
            icon={FileText}
            colorClass={COLORS.tickets}
            items={data.tickets.created}
          />
          <RankingCard
            title="Admins que mas resolvieron tickets"
            icon={FileText}
            colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
            items={data.tickets.resolved}
          />
        </div>
      </div>

      {/* Contracts Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-blue-500" />
          Contratos
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankingCard
            title="Clientes que mas crearon contratos"
            icon={Users}
            colorClass={COLORS.contracts}
            items={data.contracts.createdByClient}
            showValue
            valueKey="totalValue"
          />
          <RankingCard
            title="Doers que mas completaron contratos"
            icon={Trophy}
            colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
            items={data.contracts.completedByDoer}
            showValue
            valueKey="totalValue"
          />
        </div>
      </div>

      {/* Payments & Jobs Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-green-500" />
          Pagos y Trabajos
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankingCard
            title="Admins que mas liberaron pagos"
            icon={CreditCard}
            colorClass={COLORS.payments}
            items={data.payments.released}
            showValue
            valueKey="totalAmount"
          />
          <RankingCard
            title="Clientes que mas crearon trabajos"
            icon={Briefcase}
            colorClass={COLORS.jobs}
            items={data.jobs.created}
            showValue
            valueKey="totalValue"
          />
        </div>
      </div>
    </div>
  );
}
