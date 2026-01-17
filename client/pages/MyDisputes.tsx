import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  AlertCircle,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  FileText,
  Loader2,
  AlertTriangle,
  Bug,
  DollarSign,
  Briefcase,
  Filter,
  ChevronRight,
} from 'lucide-react';

interface Dispute {
  id: string;
  category: 'service_not_delivered' | 'incomplete_work' | 'quality_issues' | 'payment_issues' | 'breach_of_contract' | 'bug_report' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_review' | 'awaiting_info' | 'resolved_released' | 'resolved_refunded' | 'resolved_partial' | 'cancelled';
  reason: string;
  detailedDescription: string;
  createdAt: string;
  updatedAt: string;
  contract?: {
    id: string;
    title?: string;
  };
  job?: {
    id: string;
    title: string;
  };
  messagesCount?: number;
  importanceLevel?: 'low' | 'medium' | 'high' | 'critical';
}

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  service_not_delivered: { label: 'Servicio no entregado', icon: Briefcase, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  incomplete_work: { label: 'Trabajo incompleto', icon: FileText, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  quality_issues: { label: 'Problemas de calidad', icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30' },
  payment_issues: { label: 'Problema de pago', icon: DollarSign, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  breach_of_contract: { label: 'Incumplimiento de contrato', icon: Clock, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  bug_report: { label: 'Reporte de bug', icon: Bug, color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30' },
  other: { label: 'Otro', icon: AlertCircle, color: 'text-gray-600 bg-gray-100 dark:bg-gray-700' },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  low: { label: 'Baja', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Abierta', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: AlertCircle },
  in_review: { label: 'En revisión', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: Clock },
  awaiting_info: { label: 'Esperando info', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: MessageSquare },
  resolved_released: { label: 'Resuelta - Liberado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  resolved_refunded: { label: 'Resuelta - Reembolsado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  resolved_partial: { label: 'Resuelta - Parcial', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: XCircle },
};

export default function MyDisputes() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'contracts' | 'other'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadDisputes();
  }, []);

  const loadDisputes = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  // Contract-related categories
  const contractCategories = ['service_not_delivered', 'incomplete_work', 'quality_issues', 'payment_issues', 'breach_of_contract'];
  const isContractDispute = (d: Dispute) => contractCategories.includes(d.category);

  const filteredDisputes = disputes.filter(d => {
    // Tab filter
    if (activeTab === 'contracts' && !isContractDispute(d)) return false;
    if (activeTab === 'other' && isContractDispute(d)) return false;

    // Status filter
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;

    return true;
  });

  const contractDisputes = disputes.filter(d => isContractDispute(d));
  const otherDisputes = disputes.filter(d => !isContractDispute(d));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Mis Disputas
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Gestiona tus reclamos y reportes
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/disputes/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nueva Disputa
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'all'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              Todas ({disputes.length})
            </button>
            <button
              onClick={() => setActiveTab('contracts')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'contracts'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Briefcase className="h-4 w-4" />
                Contratos ({contractDisputes.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('other')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'other'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Bug className="h-4 w-4" />
                Otros ({otherDisputes.length})
              </span>
            </button>
          </div>

          {/* Status Filter */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-slate-700 dark:text-slate-300"
              >
                <option value="all">Todos los estados</option>
                <option value="open">Abiertas</option>
                <option value="in_review">En revisión</option>
                <option value="awaiting_info">Esperando información</option>
                <option value="resolved_released">Resueltas - Liberado</option>
                <option value="resolved_refunded">Resueltas - Reembolsado</option>
                <option value="resolved_partial">Resueltas - Parcial</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>
          </div>

          {/* Disputes List */}
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredDisputes.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  No tienes disputas {activeTab !== 'all' ? `en esta categoría` : ''}
                </p>
                <Link
                  to="/disputes/create"
                  className="inline-flex items-center gap-2 mt-4 text-sky-600 hover:text-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  Crear nueva disputa
                </Link>
              </div>
            ) : (
              filteredDisputes.map((dispute) => {
                const category = categoryLabels[dispute.category] || categoryLabels.other;
                const priority = priorityLabels[dispute.priority] || priorityLabels.medium;
                const status = statusLabels[dispute.status] || statusLabels.open;
                const CategoryIcon = category.icon;
                const StatusIcon = status.icon;

                return (
                  <Link
                    key={dispute.id}
                    to={`/disputes/${dispute.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {/* Category Icon */}
                    <div className={`p-3 rounded-lg ${category.color}`}>
                      <CategoryIcon className="h-5 w-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-900 dark:text-white truncate">
                          {dispute.reason || 'Sin motivo especificado'}
                        </h3>
                        {/* Priority Badge */}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}>
                          {priority.label}
                        </span>
                      </div>

                      {/* Contract/Job info */}
                      {dispute.contract && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                          Contrato: {dispute.contract.title || `#${dispute.contract.id.slice(0, 8)}`}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        {/* Status Badge */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>

                        {/* Messages count */}
                        {dispute.messagesCount && dispute.messagesCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <MessageSquare className="h-3 w-3" />
                            {dispute.messagesCount} mensajes
                          </span>
                        )}

                        {/* Date */}
                        <span className="text-xs text-slate-500">
                          {new Date(dispute.createdAt).toLocaleDateString('es-AR')}
                        </span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                ¿Cuándo crear una disputa?
              </h4>
              <ul className="mt-2 text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• <strong>Problemas con contratos:</strong> Calidad del trabajo, pagos, incumplimiento de plazos</li>
                <li>• <strong>Reportes de bugs:</strong> Problemas técnicos en la plataforma</li>
                <li>• <strong>Otros:</strong> Cualquier otro inconveniente que necesites reportar</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
