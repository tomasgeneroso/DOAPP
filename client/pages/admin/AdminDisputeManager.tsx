import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '@/hooks/useSocket';
import { Wifi, WifiOff, Bell } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

type SortField = 'reason' | 'category' | 'priority' | 'status' | 'date' | 'initiator' | 'against';
type SortDirection = 'asc' | 'desc' | null;

interface Dispute {
  id: string;
  _id?: string;
  reason: string;
  status: string;
  priority: string;
  category: string;
  importanceLevel?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date | string;
  initiatedBy: {
    id?: string;
    _id?: string;
    name: string;
    email?: string;
  };
  against: {
    id?: string;
    _id?: string;
    name: string;
    email?: string;
  };
  contract?: {
    id?: string;
    _id?: string;
    title?: string;
    price?: number;
  };
  resolution?: string;
  resolutionType?: string;
  resolutionAmount?: number;
  resolvedAt?: string;
  resolvedBy?: {
    id?: string;
    _id?: string;
    name: string;
  };
}

interface DisputeStats {
  total: number;
  open: number;
  inReview: number;
  resolved: number;
  byPriority: {
    low?: number;
    medium?: number;
    high?: number;
    urgent?: number;
  };
  byResolutionType: {
    full_release?: number;
    full_refund?: number;
    partial_refund?: number;
  };
}

const AdminDisputeManager: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected, registerAdminDisputeCreatedHandler, registerAdminDisputeUpdatedHandler } = useSocket();

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  const fetchDisputes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      params.append('page', page.toString());
      params.append('limit', '20');

      const response = await axios.get(`${API_URL}/api/admin/disputes?${params}`, {
        withCredentials: true,
      });

      setDisputes(response.data.data);
      setTotalPages(response.data.pagination.pages);
    } catch (error) {
      console.error('Error fetching disputes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/disputes/stats/overview`, {
        withCredentials: true,
      });
      setStats(response.data.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [filterStatus, filterPriority, page]);

  useEffect(() => {
    fetchStats();
  }, []);

  // Real-time handlers
  const handleNewDispute = useCallback((data: any) => {
    console.log('🔔 New dispute received:', data);
    setRealtimeAlert(`Nueva disputa: ${data.dispute?.reason || 'Sin motivo'}`);
    setDisputes(prev => [data.dispute, ...prev]);
    // Refresh stats
    fetchStats();
    // Auto-hide alert after 5 seconds
    setTimeout(() => setRealtimeAlert(null), 5000);
  }, []);

  const handleDisputeUpdated = useCallback((data: any) => {
    console.log('🔔 Dispute updated:', data);
    setRealtimeAlert(`Disputa actualizada: ${data.dispute?.reason || 'Sin motivo'}`);
    setDisputes(prev =>
      prev.map(d => (d.id === data.dispute?.id || d._id === data.dispute?._id) ? { ...d, ...data.dispute } : d)
    );
    // Refresh stats
    fetchStats();
    // Auto-hide alert after 5 seconds
    setTimeout(() => setRealtimeAlert(null), 5000);
  }, []);

  useEffect(() => {
    registerAdminDisputeCreatedHandler(handleNewDispute);
    registerAdminDisputeUpdatedHandler(handleDisputeUpdated);
  }, [registerAdminDisputeCreatedHandler, registerAdminDisputeUpdatedHandler, handleNewDispute, handleDisputeUpdated]);

  const getStatusBadge = (status: string) => {
    const styles = {
      open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      in_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      awaiting_info: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      resolved_released: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      resolved_refunded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      resolved_partial: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    };

    const labels = {
      open: 'Abierta',
      in_review: 'En Revisión',
      awaiting_info: 'Esperando Info',
      resolved_released: 'Resuelta',
      resolved_refunded: 'Resuelta',
      resolved_partial: 'Resuelta',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.open}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse',
    };

    const labels = {
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      urgent: 'Urgente',
    };

    const icons = {
      low: '○',
      medium: '◐',
      high: '●',
      urgent: '⚠️',
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${styles[priority as keyof typeof styles] || styles.medium}`}>
        <span>{icons[priority as keyof typeof icons] || '○'}</span>
        {labels[priority as keyof typeof labels] || priority}
      </span>
    );
  };

  const getImportanceBadge = (importance: string | undefined) => {
    if (!importance) return null;

    const styles = {
      low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600',
      medium: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-200 dark:border-sky-700',
      high: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700',
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-700 animate-pulse',
    };

    const labels = {
      low: 'Importancia: Baja',
      medium: 'Importancia: Media',
      high: 'Importancia: Alta',
      critical: '🔴 CRÍTICO',
    };

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[importance as keyof typeof styles] || styles.medium}`}>
        {labels[importance as keyof typeof labels] || importance}
      </span>
    );
  };

  const handleSort = (field: SortField) => {
    let newDirection: SortDirection = 'asc';

    if (sortField === field) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
      }
    }

    setSortField(newDirection === null ? null : field);
    setSortDirection(newDirection);
  };

  const getPriorityOrder = (priority: string): number => {
    const order: Record<string, number> = {
      'urgent': 4,
      'high': 3,
      'medium': 2,
      'low': 1
    };
    return order[priority] || 0;
  };

  const getStatusOrder = (status: string): number => {
    const order: Record<string, number> = {
      'open': 1,
      'in_review': 2,
      'awaiting_info': 3,
      'resolved_released': 4,
      'resolved_refunded': 5,
      'resolved_partial': 6
    };
    return order[status] || 0;
  };

  const getFilteredDisputes = () => {
    return disputes.filter((dispute) => {
      const disputeId = dispute.id || dispute._id || '';
      const matchesSearch =
        searchQuery === "" ||
        disputeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dispute.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dispute.initiatedBy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dispute.against.name.toLowerCase().includes(searchQuery.toLowerCase());
      const disputeDate = new Date(dispute.createdAt);
      const matchesDateFrom = !dateFrom || disputeDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || disputeDate <= new Date(dateTo + 'T23:59:59');
      return matchesSearch && matchesDateFrom && matchesDateTo;
    });
  };

  const getSortedDisputes = () => {
    const filtered = getFilteredDisputes();
    if (!sortField || !sortDirection) return filtered;

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'reason':
          comparison = a.reason.localeCompare(b.reason, 'es');
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category, 'es');
          break;
        case 'initiator':
          comparison = a.initiatedBy.name.localeCompare(b.initiatedBy.name, 'es');
          break;
        case 'against':
          comparison = a.against.name.localeCompare(b.against.name, 'es');
          break;
        case 'priority':
          comparison = getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
          break;
        case 'status':
          comparison = getStatusOrder(a.status) - getStatusOrder(b.status);
          break;
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Real-time Alert */}
        {realtimeAlert && (
          <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 animate-pulse">
            <Bell className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-800 dark:text-yellow-200 font-medium">{realtimeAlert}</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Disputas</h1>
              {/* Connection indicator */}
              <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                isConnected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400">Administra y resuelve disputas de contratos</p>
          </div>
          <button
            onClick={() => navigate('/admin/disputes/create')}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition shadow-md hover:shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Crear Disputa
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Abiertas</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.open}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">En Revisión</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.inReview}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Resueltas</p>
                  <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Priority Distribution */}
        {stats && stats.byPriority && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Distribución por Prioridad</h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <span className="text-gray-400">○</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">Baja:</span>
                <span className="font-bold text-gray-900 dark:text-white">{stats.byPriority.low || 0}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span className="text-blue-500">◐</span>
                <span className="text-sm text-blue-600 dark:text-blue-300">Media:</span>
                <span className="font-bold text-blue-700 dark:text-blue-200">{stats.byPriority.medium || 0}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <span className="text-orange-500">●</span>
                <span className="text-sm text-orange-600 dark:text-orange-300">Alta:</span>
                <span className="font-bold text-orange-700 dark:text-orange-200">{stats.byPriority.high || 0}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <span>⚠️</span>
                <span className="text-sm text-red-600 dark:text-red-300">Urgente:</span>
                <span className="font-bold text-red-700 dark:text-red-200">{stats.byPriority.urgent || 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Buscar</label>
              <input
                type="text"
                placeholder="Buscar por ID, motivo o usuario..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Todos</option>
                <option value="open">Abiertas</option>
                <option value="in_review">En Revisión</option>
                <option value="awaiting_info">Esperando Info</option>
                <option value="resolved_released">Resuelta - Liberado</option>
                <option value="resolved_refunded">Resuelta - Reembolsado</option>
                <option value="resolved_partial">Resuelta - Parcial</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prioridad</label>
              <select
                value={filterPriority}
                onChange={(e) => {
                  setFilterPriority(e.target.value);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Todas</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterStatus('');
                  setFilterPriority('');
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Disputes Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : disputes.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-4 text-gray-600 dark:text-gray-400">No se encontraron disputas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('priority')}
                        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        Prioridad
                        <SortIcon field="priority" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('reason')}
                        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        Motivo
                        <SortIcon field="reason" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        Categoría
                        <SortIcon field="category" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Partes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        Estado
                        <SortIcon field="status" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('date')}
                        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        Fecha
                        <SortIcon field="date" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {getSortedDisputes().map((dispute) => (
                    <tr key={dispute.id || dispute._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">
                        <div className="text-xs font-mono text-gray-600 dark:text-gray-400" title={dispute.id || dispute._id}>
                          {(dispute.id || dispute._id || '').slice(-8).toUpperCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {getPriorityBadge(dispute.priority)}
                          {dispute.importanceLevel && getImportanceBadge(dispute.importanceLevel)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                          {dispute.reason}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {dispute.category.replace(/_/g, ' ')}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900 dark:text-white">{dispute.initiatedBy.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">vs {dispute.against.name}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(dispute.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        <div>{new Date(dispute.createdAt).toLocaleDateString('es-AR')}</div>
                        <div className="text-xs">{new Date(dispute.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => navigate(`/admin/disputes/${dispute.id || dispute._id}`)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-600">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDisputeManager;
