import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import {
  ArrowLeft,
  User,
  AlertTriangle,
  FileText,
  Briefcase,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Calendar,
  Shield,
} from "lucide-react";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  adminRole?: string;
  createdAt: string;
}

interface UserActivityDetail {
  user: UserInfo;
  activity: {
    disputes: {
      opened: number;
      resolved: number;
      against: number;
    };
    tickets: {
      created: number;
      resolved: number;
    };
    contracts: {
      asClient: {
        total: number;
        completed: number;
      };
      asDoer: {
        total: number;
        completed: number;
      };
    };
    jobs: {
      created: number;
    };
    payments: {
      released: number;
    };
    financials: {
      totalSpent: number;
      totalEarned: number;
    };
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  subValue,
}: {
  label: string;
  value: number | string;
  icon: any;
  colorClass: string;
  subValue?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{subValue}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  colorClass,
  children,
}: {
  title: string;
  icon: any;
  colorClass: string;
  children: React.ReactNode;
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
      {children}
    </div>
  );
}

export default function AnalyticsUserActivityDetail() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<UserActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      loadData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.analytics.userActivityById(userId!);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(t('admin.analytics.couldNotLoadActivity', 'Could not load user activity'));
      }
    } catch (err: any) {
      console.error("Error loading user activity:", err);
      setError(err.message || t('admin.analytics.errorLoadingData', 'Error loading data'));
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

  if (error || !data) {
    return (
      <div className="p-6">
        <Link
          to="/admin/analytics/user-activity"
          className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('admin.analytics.backToRankings', 'Back to rankings')}
        </Link>
        <div className="text-center text-red-500 dark:text-red-400 mt-10">
          {error || t('admin.analytics.userNotFound', 'User not found')}
        </div>
      </div>
    );
  }

  const { user, activity } = data;
  const isAdmin = !!user.adminRole;

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <Link
        to="/admin/analytics/user-activity"
        className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a rankings
      </Link>

      {/* User Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                {user.name?.charAt(0).toUpperCase() || "?"}
              </span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.name}
              </h1>
              {isAdmin && (
                <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {user.adminRole}
                </span>
              )}
            </div>
            <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 flex items-center gap-1 mt-1">
              <Calendar className="h-4 w-4" />
              {t('admin.analytics.registered', 'Registered')}: {formatDate(user.createdAt)}
            </p>
          </div>
          <div className="ml-auto">
            <Link
              to={`/admin/users/${user.id}`}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
            >
              {t('admin.analytics.viewFullProfile', 'View full profile')}
            </Link>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8" />
            <div>
              <p className="text-green-100">{t('admin.analytics.totalEarned', 'Total Earned (as Doer)')}</p>
              <p className="text-3xl font-bold">
                {formatCurrency(activity.financials.totalEarned)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
          <div className="flex items-center gap-3">
            <TrendingDown className="h-8 w-8" />
            <div>
              <p className="text-blue-100">{t('admin.analytics.totalSpent', 'Total Spent (as Client)')}</p>
              <p className="text-3xl font-bold">
                {formatCurrency(activity.financials.totalSpent)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label={t('admin.analytics.disputesOpened', 'Disputes opened')}
          value={activity.disputes.opened}
          icon={AlertTriangle}
          colorClass="text-red-500 bg-red-100 dark:bg-red-900/20"
        />
        <StatCard
          label={t('admin.analytics.disputesAgainst', 'Disputes against')}
          value={activity.disputes.against}
          icon={AlertTriangle}
          colorClass="text-orange-500 bg-orange-100 dark:bg-orange-900/20"
        />
        {isAdmin && (
          <StatCard
            label={t('admin.analytics.disputesResolved', 'Disputes resolved')}
            value={activity.disputes.resolved}
            icon={AlertTriangle}
            colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
          />
        )}
        <StatCard
          label={t('admin.analytics.ticketsCreated', 'Tickets created')}
          value={activity.tickets.created}
          icon={FileText}
          colorClass="text-orange-500 bg-orange-100 dark:bg-orange-900/20"
        />
        {isAdmin && (
          <StatCard
            label={t('admin.analytics.ticketsResolved', 'Tickets resolved')}
            value={activity.tickets.resolved}
            icon={FileText}
            colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
          />
        )}
        <StatCard
          label={t('admin.analytics.jobsPublished', 'Jobs published')}
          value={activity.jobs.created}
          icon={Briefcase}
          colorClass="text-purple-500 bg-purple-100 dark:bg-purple-900/20"
        />
        {isAdmin && (
          <StatCard
            label={t('admin.analytics.paymentsReleased', 'Payments released')}
            value={activity.payments.released}
            icon={CreditCard}
            colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
          />
        )}
      </div>

      {/* Contracts Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title={t('admin.analytics.activityAsClient', 'Activity as Client')}
          icon={User}
          colorClass="text-blue-500 bg-blue-100 dark:bg-blue-900/20"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.totalContracts', 'Total contracts')}
              </span>
              <span className="font-bold text-gray-900 dark:text-white">
                {activity.contracts.asClient.total}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.completedContracts', 'Completed contracts')}
              </span>
              <span className="font-bold text-green-600 dark:text-green-400">
                {activity.contracts.asClient.completed}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.completionRate', 'Completion rate')}
              </span>
              <span className="font-bold text-gray-900 dark:text-white">
                {activity.contracts.asClient.total > 0
                  ? (
                      (activity.contracts.asClient.completed /
                        activity.contracts.asClient.total) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.totalSpentLabel', 'Total spent')}
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(activity.financials.totalSpent)}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('admin.analytics.activityAsDoer', 'Activity as Doer')}
          icon={Briefcase}
          colorClass="text-green-500 bg-green-100 dark:bg-green-900/20"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.totalContracts', 'Total contracts')}
              </span>
              <span className="font-bold text-gray-900 dark:text-white">
                {activity.contracts.asDoer.total}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.completedContracts', 'Completed contracts')}
              </span>
              <span className="font-bold text-green-600 dark:text-green-400">
                {activity.contracts.asDoer.completed}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.completionRate', 'Completion rate')}
              </span>
              <span className="font-bold text-gray-900 dark:text-white">
                {activity.contracts.asDoer.total > 0
                  ? (
                      (activity.contracts.asDoer.completed /
                        activity.contracts.asDoer.total) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                {t('admin.analytics.totalEarnedLabel', 'Total earned')}
              </span>
              <span className="font-bold text-green-600 dark:text-green-400">
                {formatCurrency(activity.financials.totalEarned)}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Admin Activity */}
      {isAdmin && (
        <SectionCard
          title={t('admin.analytics.adminActivity', 'Administrative Activity')}
          icon={Shield}
          colorClass="text-purple-500 bg-purple-100 dark:bg-purple-900/20"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {activity.disputes.resolved}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('admin.analytics.disputesResolved', 'Disputes resolved')}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {activity.tickets.resolved}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('admin.analytics.ticketsResolved', 'Tickets resolved')}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {activity.payments.released}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('admin.analytics.paymentsReleased', 'Payments released')}
              </p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
