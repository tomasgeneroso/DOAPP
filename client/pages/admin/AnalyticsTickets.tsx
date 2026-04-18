import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { Ticket, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
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
} from "recharts";

interface TicketAnalytics {
  ticketsByStatus: Array<{ _id: string; count: number }>;
  ticketsByCategory: Array<{ _id: string; count: number }>;
  ticketsByPriority: Array<{ _id: string; count: number }>;
  avgResolutionTimeHours: number;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82ca9d"];

export default function AnalyticsTickets() {
  const { t } = useTranslation();

  const STATUS_LABELS: Record<string, string> = {
    open: t('common.status.open', 'Open'),
    assigned: t('common.status.assigned', 'Assigned'),
    in_progress: t('common.status.inProgress', 'In Progress'),
    waiting_response: t('common.status.waitingResponse', 'Waiting Response'),
    closed: t('common.status.closed', 'Closed'),
    resolved: t('common.status.resolved', 'Resolved'),
  };

  const CATEGORY_LABELS: Record<string, string> = {
    technical: t('admin.tickets.categories.technical', 'Technical'),
    billing: t('admin.tickets.categories.billing', 'Billing'),
    account: t('admin.tickets.categories.account', 'Account'),
    general: t('admin.tickets.categories.general', 'General'),
    bug: t('admin.tickets.categories.bug', 'Bug'),
    feature_request: t('admin.tickets.categories.featureRequest', 'Feature Request'),
  };

  const PRIORITY_LABELS: Record<string, string> = {
    low: t('common.priority.low', 'Low'),
    medium: t('common.priority.medium', 'Medium'),
    high: t('common.priority.high', 'High'),
    urgent: t('common.priority.urgent', 'Urgent'),
  };

  const [analytics, setAnalytics] = useState<TicketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    loadAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await adminApi.analytics.tickets(period);
      if (response.success && response.data) {
        setAnalytics(response.data as any);
      }
    } catch (error) {
      console.error("Error loading ticket analytics:", error);
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

  if (!analytics) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        {t('admin.analytics.loadError', 'Could not load metrics')}
      </div>
    );
  }

  const totalTickets = analytics.ticketsByStatus.reduce((sum, s) => sum + s.count, 0);
  const openTickets =
    (analytics.ticketsByStatus.find((s) => s._id === "open")?.count || 0) +
    (analytics.ticketsByStatus.find((s) => s._id === "assigned")?.count || 0) +
    (analytics.ticketsByStatus.find((s) => s._id === "in_progress")?.count || 0);
  const closedTickets =
    (analytics.ticketsByStatus.find((s) => s._id === "closed")?.count || 0) +
    (analytics.ticketsByStatus.find((s) => s._id === "resolved")?.count || 0);
  const resolutionRate = totalTickets > 0 ? (closedTickets / totalTickets) * 100 : 0;

  // Transform data for charts
  const statusChartData = analytics.ticketsByStatus.map((item) => ({
    ...item,
    name: STATUS_LABELS[item._id] || item._id,
  }));

  const categoryChartData = analytics.ticketsByCategory.map((item) => ({
    ...item,
    name: CATEGORY_LABELS[item._id] || item._id,
  }));

  const priorityChartData = analytics.ticketsByPriority.map((item) => ({
    ...item,
    name: PRIORITY_LABELS[item._id] || item._id,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('admin.analytics.ticketMetrics', 'Ticket Metrics')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('admin.analytics.ticketSubtitle', 'Detailed analysis of support and tickets')}
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2">
          {["7d", "30d", "90d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                period === p
                  ? "bg-sky-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {p === "7d" ? t('admin.analytics.7days', '7 days') : p === "30d" ? t('admin.analytics.30days', '30 days') : t('admin.analytics.90days', '90 days')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 dark:bg-blue-900/20 p-3 rounded-lg">
              <Ticket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('admin.analytics.totalTickets', 'Total Tickets')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalTickets}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 dark:bg-orange-900/20 p-3 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('common.status.open', 'Open')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{openTickets}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div className="bg-green-100 dark:bg-green-900/20 p-3 rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('admin.analytics.resolutionRate', 'Resolution Rate')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {resolutionRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div className="bg-purple-100 dark:bg-purple-900/20 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('admin.analytics.avgTime', 'Average Time')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analytics.avgResolutionTimeHours.toFixed(1)}h
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets by Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.analytics.ticketsByStatus', 'Tickets by Status')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={100} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                }}
              />
              <Legend />
              <Bar dataKey="count" fill="#0EA5E9" name={t('admin.sidebar.tickets', 'Tickets')} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tickets by Category */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.analytics.ticketsByCategory', 'Tickets by Category')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryChartData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {categoryChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets by Priority */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.analytics.ticketsByPriority', 'Tickets by Priority')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={priorityChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                }}
              />
              <Legend />
              <Bar dataKey="count" fill="#F59E0B" name={t('admin.sidebar.tickets', 'Tickets')} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Distribution Pie */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.analytics.priorityDistribution', 'Priority Distribution')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={priorityChartData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {priorityChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.analytics.summaryByCategory', 'Summary by Category')}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.category', 'Category')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.quantity', 'Quantity')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {categoryChartData.map((item) => (
                  <tr key={item._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {item.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {((item.count / totalTickets) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Priority Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.analytics.summaryByPriority', 'Summary by Priority')}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.priority.label', 'Priority')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.quantity', 'Quantity')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {priorityChartData.map((item) => (
                  <tr key={item._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {item.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {((item.count / totalTickets) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
