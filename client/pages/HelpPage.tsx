import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import {
  HelpCircle,
  AlertCircle,
  FileText,
  MessageCircle,
  BookOpen,
  Shield,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  Bug,
  Briefcase,
  DollarSign,
  AlertTriangle,
  Filter,
  Ticket,
} from "lucide-react";

interface DisputeItem {
  id: string;
  category: string;
  priority: string;
  status: string;
  reason: string;
  createdAt: string;
  contract?: { id: string; title?: string };
  messagesCount?: number;
}

interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
}

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  service_not_delivered: { label: 'Service not delivered', icon: Briefcase, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  incomplete_work: { label: 'Incomplete work', icon: FileText, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  quality_issues: { label: 'Quality issues', icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30' },
  payment_issues: { label: 'Payment issue', icon: DollarSign, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  breach_of_contract: { label: 'Breach of contract', icon: Clock, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  bug_report: { label: 'Bug report', icon: Bug, color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30' },
  other: { label: 'Other', icon: AlertCircle, color: 'text-gray-600 bg-gray-100 dark:bg-gray-700' },
};

const ticketCategoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  feature: { label: 'Suggestion', icon: HelpCircle, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  support: { label: 'Support', icon: HelpCircle, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
  report_user: { label: 'Report user', icon: AlertCircle, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  report_contract: { label: 'Report contract', icon: FileText, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  payment: { label: 'Payment', icon: DollarSign, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
  other: { label: 'Other', icon: HelpCircle, color: 'text-gray-600 bg-gray-100 dark:bg-gray-700' },
};

const statusLabels: Record<string, { label: string; tKey: string; color: string; icon: any }> = {
  open: { label: 'Open', tKey: 'help.status.open', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: AlertCircle },
  in_review: { label: 'In review', tKey: 'help.status.inReview', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: Clock },
  in_progress: { label: 'In progress', tKey: 'help.status.inProgress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: Clock },
  awaiting_info: { label: 'Awaiting info', tKey: 'help.status.awaitingInfo', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: MessageCircle },
  waiting_response: { label: 'Waiting for response', tKey: 'help.status.waitingResponse', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: MessageCircle },
  resolved: { label: 'Resolved', tKey: 'help.status.resolved', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  resolved_released: { label: 'Resolved - Released', tKey: 'help.status.resolvedReleased', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  resolved_refunded: { label: 'Resolved - Refunded', tKey: 'help.status.resolvedRefunded', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  resolved_partial: { label: 'Resolved - Partial', tKey: 'help.status.resolvedPartial', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  closed: { label: 'Closed', tKey: 'help.status.closed', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: XCircle },
  cancelled: { label: 'Cancelled', tKey: 'help.status.cancelled', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: XCircle },
};

const priorityLabels: Record<string, { label: string; tKey: string; color: string }> = {
  low: { label: 'Low', tKey: 'help.priority.low', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  medium: { label: 'Medium', tKey: 'help.priority.medium', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  high: { label: 'High', tKey: 'help.priority.high', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  urgent: { label: 'Urgent', tKey: 'help.priority.urgent', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

export default function HelpPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const [activeTab, setActiveTab] = useState<'overview' | 'disputes' | 'tickets'>('overview');
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (activeTab === 'disputes') {
      loadDisputes();
    } else if (activeTab === 'tickets') {
      loadTickets();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadDisputes = async () => {
    try {
      setLoadingDisputes(true);
      const response = await fetch('/api/disputes/my-disputes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setDisputes(data.data || []);
      }
    } catch (error) {
      console.error('Error loading disputes:', error);
    } finally {
      setLoadingDisputes(false);
    }
  };

  const loadTickets = async () => {
    try {
      setLoadingTickets(true);
      const response = await fetch('/api/tickets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setTickets(data.tickets || []);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoadingTickets(false);
    }
  };

  const filteredDisputes = disputes.filter(d =>
    statusFilter === 'all' || d.status === statusFilter
  );

  const filteredTickets = tickets.filter(tk =>
    statusFilter === 'all' || tk.status === statusFilter
  );

  const openDisputes = disputes.filter(d => !d.status.startsWith('resolved') && d.status !== 'cancelled').length;
  const openTickets = tickets.filter(tk => tk.status !== 'resolved' && tk.status !== 'closed').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('help.title', 'Help Center & Support')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {t('help.subtitle', 'Manage your tickets, disputes, and get help')}
            </p>
          </div>
          <div className="flex gap-2">
            {hasPermission(PERMISSIONS.TICKET_CREATE) && (
              <Link
                to="/tickets/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Ticket className="h-4 w-4" />
                {t('help.newTicket', 'New Ticket')}
              </Link>
            )}
            {hasPermission(PERMISSIONS.DISPUTE_CREATE) && (
              <Link
                to="/disputes/create"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                <AlertCircle className="h-4 w-4" />
                {t('help.newDispute', 'New Dispute')}
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => { setActiveTab('overview'); setStatusFilter('all'); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <HelpCircle className="h-4 w-4" />
                {t('help.overview', 'Overview')}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab('disputes'); setStatusFilter('all'); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'disputes'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title={t('help.disputesTooltip', 'Disputes are claims related to contracts and specific jobs')}
            >
              <span className="flex items-center justify-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {t('help.myDisputes', 'My Disputes')}
                {openDisputes > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-orange-500 text-white rounded-full">
                    {openDisputes}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab('tickets'); setStatusFilter('all'); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'tickets'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title={t('help.ticketsTooltip', 'Tickets are for reporting bugs, requesting features, or general inquiries')}
            >
              <span className="flex items-center justify-center gap-2">
                <Ticket className="h-4 w-4" />
                {t('help.myTickets', 'My Tickets')}
                {openTickets > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                    {openTickets}
                  </span>
                )}
              </span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="grid md:grid-cols-2 gap-4">
                  {hasPermission(PERMISSIONS.TICKET_CREATE) && (
                    <Link
                      to="/tickets/new"
                      className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border-2 border-blue-200 dark:border-blue-800 p-5 hover:border-blue-400 dark:hover:border-blue-600 transition-colors group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition">
                          <Ticket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {t('help.createTicket', 'Create Support Ticket')}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('help.createTicketDesc', 'Report bugs, request features, or get general help')}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )}

                  {hasPermission(PERMISSIONS.DISPUTE_CREATE) && (
                    <Link
                      to="/disputes/create"
                      className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border-2 border-orange-200 dark:border-orange-800 p-5 hover:border-orange-400 dark:hover:border-orange-600 transition-colors group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50 transition">
                          <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {t('help.openDispute', 'Open a Dispute')}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('help.openDisputeDesc', 'Problems with a contract? Report with evidence')}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )}

                  <Link
                    to="/contact"
                    className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border-2 border-green-200 dark:border-green-800 p-5 hover:border-green-400 dark:hover:border-green-600 transition-colors group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition">
                        <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {t('help.directContact', 'Direct Contact')}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('help.directContactDesc', 'Send a message to our team')}
                        </p>
                      </div>
                    </div>
                  </Link>

                  <Link
                    to="/contracts"
                    className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border-2 border-purple-200 dark:border-purple-800 p-5 hover:border-purple-400 dark:hover:border-purple-600 transition-colors group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition">
                        <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {t('help.viewContracts', 'View My Contracts')}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('help.viewContractsDesc', 'Report from a specific contract')}
                        </p>
                      </div>
                    </div>
                  </Link>
                </div>

                {/* FAQ Section */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('help.faq', 'Frequently Asked Questions')}
                    </h2>
                  </div>

                  <div className="space-y-3">
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {t('help.faq1Question', 'What is the difference between a ticket and a dispute?')}
                        </span>
                        <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="p-3 text-gray-600 dark:text-gray-400 text-sm">
                        <p><strong>{t('help.faq1TicketsLabel', 'Tickets')}</strong> {t('help.faq1TicketsAnswer', 'are for technical issues, bugs, general questions, or support requests that do not involve money.')}</p>
                        <p className="mt-2"><strong>{t('help.faq1DisputesLabel', 'Disputes')}</strong> {t('help.faq1DisputesAnswer', 'are for issues related to specific contracts where money is at stake (escrow).')}</p>
                      </div>
                    </details>

                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {t('help.faq2Question', 'How long does it take to resolve a ticket?')}
                        </span>
                        <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="p-3 text-gray-600 dark:text-gray-400 text-sm">
                        <p>{t('help.faq2Answer', 'Tickets are generally responded to within 24-48 business hours.')}</p>
                      </div>
                    </details>

                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {t('help.faq3Question', 'What evidence should I include in a dispute?')}
                        </span>
                        <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="p-3 text-gray-600 dark:text-gray-400 text-sm">
                        <p>{t('help.faq3Answer', 'Screenshots, photos/videos of the work, documents, and any evidence that supports your case.')}</p>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )}

            {/* Disputes Tab */}
            {activeTab === 'disputes' && (
              <div>
                {/* Status Filter */}
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">{t('help.allStatuses', 'All statuses')}</option>
                    <option value="open">{t('help.filter.open', 'Open')}</option>
                    <option value="in_review">{t('help.filter.inReview', 'In review')}</option>
                    <option value="awaiting_info">{t('help.filter.awaitingInfo', 'Awaiting information')}</option>
                    <option value="resolved_released">{t('help.filter.resolvedReleased', 'Resolved - Released')}</option>
                    <option value="resolved_refunded">{t('help.filter.resolvedRefunded', 'Resolved - Refunded')}</option>
                    <option value="cancelled">{t('help.filter.cancelled', 'Cancelled')}</option>
                  </select>
                </div>

                {loadingDisputes ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                  </div>
                ) : filteredDisputes.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400">{t('help.noDisputes', 'You have no disputes')}</p>
                    <Link
                      to="/disputes/create"
                      className="inline-flex items-center gap-2 mt-4 text-orange-600 hover:text-orange-700"
                    >
                      <Plus className="h-4 w-4" />
                      {t('help.createNewDispute', 'Create new dispute')}
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredDisputes.map((dispute) => {
                      const category = categoryLabels[dispute.category] || categoryLabels.other;
                      const priority = priorityLabels[dispute.priority] || priorityLabels.medium;
                      const status = statusLabels[dispute.status] || statusLabels.open;
                      const CategoryIcon = category.icon;
                      const StatusIcon = status.icon;

                      return (
                        <Link
                          key={dispute.id}
                          to={`/disputes/${dispute.id}`}
                          className="flex items-center gap-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors -mx-4 px-4"
                        >
                          <div className={`p-2.5 rounded-lg ${category.color}`}>
                            <CategoryIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-slate-900 dark:text-white truncate">
                                {dispute.reason || t('help.noReason', 'No reason specified')}
                              </h3>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}>
                                {t(priority.tKey, priority.label)}
                              </span>
                            </div>
                            {dispute.contract && (
                              <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                                {t('help.contract', 'Contract')}: {dispute.contract.title || `#${dispute.contract.id.slice(0, 8)}`}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {t(status.tKey, status.label)}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(dispute.createdAt).toLocaleDateString('es-AR')}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-400" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tickets Tab */}
            {activeTab === 'tickets' && (
              <div>
                {/* Status Filter */}
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">{t('help.allStatuses', 'All statuses')}</option>
                    <option value="open">{t('help.filter.openTickets', 'Open')}</option>
                    <option value="in_progress">{t('help.filter.inProgress', 'In progress')}</option>
                    <option value="waiting_response">{t('help.filter.waitingResponse', 'Waiting for response')}</option>
                    <option value="resolved">{t('help.filter.resolved', 'Resolved')}</option>
                    <option value="closed">{t('help.filter.closed', 'Closed')}</option>
                  </select>
                </div>

                {loadingTickets ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="text-center py-12">
                    <Ticket className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400">{t('help.noTickets', 'You have no tickets')}</p>
                    <Link
                      to="/tickets/new"
                      className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      {t('help.createNewTicket', 'Create new ticket')}
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredTickets.map((ticket) => {
                      const category = ticketCategoryLabels[ticket.category] || ticketCategoryLabels.other;
                      const priority = priorityLabels[ticket.priority] || priorityLabels.medium;
                      const status = statusLabels[ticket.status] || statusLabels.open;
                      const CategoryIcon = category.icon;
                      const StatusIcon = status.icon;

                      return (
                        <Link
                          key={ticket.id}
                          to={`/tickets/${ticket.id}`}
                          className="flex items-center gap-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors -mx-4 px-4"
                        >
                          <div className={`p-2.5 rounded-lg ${category.color}`}>
                            <CategoryIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-slate-500 font-mono">{ticket.ticketNumber}</span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}>
                                {t(priority.tKey, priority.label)}
                              </span>
                            </div>
                            <h3 className="font-medium text-slate-900 dark:text-white truncate">
                              {ticket.subject}
                            </h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {t(status.tKey, status.label)}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(ticket.createdAt).toLocaleDateString('es-AR')}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-400" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-start gap-4">
            <Shield className="h-8 w-8 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold mb-2">
                {t('help.needHelp', 'Need immediate help?')}
              </h3>
              <p className="text-sky-50 mb-4">
                {t('help.teamAvailable', 'Our team is available to help you.')}
              </p>
              <Link
                to="/contact"
                className="inline-block bg-white text-sky-600 px-6 py-2 rounded-lg font-medium hover:bg-sky-50 transition"
              >
                {t('help.contactSupport', 'Contact Support')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
