import { useState, useEffect, useCallback } from "react";
import { Briefcase, CheckCircle, XCircle, Clock, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown, Image as ImageIcon, FileText, Download, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useSocket } from "../../hooks/useSocket";

interface PaymentProof {
  id: string;
  fileUrl: string;
  fileType: 'pdf' | 'png' | 'jpeg' | 'jpg';
  fileName: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
}

interface Job {
  id: string;
  title: string;
  description?: string;
  summary?: string;
  category: string;
  price?: number;
  budget?: number;
  currency?: string;
  status: string;
  client?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  images?: string[];
  paymentProof?: PaymentProof;
  createdAt: string;
  rejectedReason?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

interface JobStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

type SortField = 'title' | 'category' | 'budget' | 'status' | 'date' | 'user';
type SortDirection = 'asc' | 'desc' | null;

export default function AdminJobManager() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedProof, setSelectedProof] = useState<PaymentProof | null>(null);
  const [rejectModal, setRejectModal] = useState<{ jobId: string; jobTitle: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [newJobAlert, setNewJobAlert] = useState<string | null>(null);

  const { registerAdminJobCreatedHandler, registerAdminJobUpdatedHandler, isConnected } = useSocket();

  // Handle real-time job creation
  const handleNewJob = useCallback((data: any) => {
    console.log("🆕 Real-time: New job created", data);
    setNewJobAlert(`Nuevo trabajo: ${data.job?.title || 'Sin título'}`);
    // Add job to the list if matching current filter
    if (data.job) {
      setJobs(prev => {
        // Check if job already exists
        if (prev.some(j => j.id === data.job.id)) return prev;
        return [data.job, ...prev];
      });
      setStats(prev => ({
        ...prev,
        total: prev.total + 1,
        pending: data.job.status === 'pending' || data.job.status === 'pending_approval' ? prev.pending + 1 : prev.pending,
        approved: data.job.status === 'open' ? prev.approved + 1 : prev.approved
      }));
    }
    // Auto-hide alert after 5 seconds
    setTimeout(() => setNewJobAlert(null), 5000);
  }, []);

  // Handle real-time job updates
  const handleJobUpdated = useCallback((data: any) => {
    console.log("📝 Real-time: Job updated", data);
    if (data.job) {
      setJobs(prev => prev.map(j => j.id === data.job.id ? { ...j, ...data.job } : j));
      // Refresh stats
      fetchStats();
    }
  }, []);

  // Register socket handlers
  useEffect(() => {
    registerAdminJobCreatedHandler(handleNewJob);
    registerAdminJobUpdatedHandler(handleJobUpdated);
  }, [registerAdminJobCreatedHandler, registerAdminJobUpdatedHandler, handleNewJob, handleJobUpdated]);

  useEffect(() => {
    fetchJobs();
    fetchStats();
  }, [statusFilter]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();

      if (statusFilter !== "all") params.append("status", statusFilter);

      const response = await fetch(`/api/admin/jobs?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setJobs(data.data || data.jobs || []);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/jobs/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const updateJobStatus = async (jobId: string, status: 'approved' | 'rejected', reason?: string) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/jobs/${jobId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, rejectedReason: reason }),
      });

      const data = await response.json();
      if (data.success) {
        // Refrescar la lista
        fetchJobs();
        fetchStats();
        alert(`Publicación ${status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`);
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error updating job status:", error);
      alert("Error al actualizar el estado");
    }
  };

  const handleApprove = (jobId: string) => {
    if (confirm("¿Estás seguro de aprobar esta publicación?")) {
      updateJobStatus(jobId, 'approved');
    }
  };

  const handleReject = (jobId: string, jobTitle: string) => {
    setRejectReason("");
    setRejectModal({ jobId, jobTitle });
  };

  const confirmReject = () => {
    if (rejectModal) {
      updateJobStatus(rejectModal.jobId, 'rejected', rejectReason || undefined);
      setRejectModal(null);
      setRejectReason("");
    }
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

  const getSortedAndFilteredJobs = () => {
    let result = jobs.filter((job) => {
      const matchesSearch =
        searchQuery === "" ||
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.client?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });

    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let comparison = 0;

        switch (sortField) {
          case 'title':
            comparison = a.title.localeCompare(b.title, 'es');
            break;
          case 'category':
            comparison = (a.category || '').localeCompare(b.category || '', 'es');
            break;
          case 'budget':
            comparison = (a.price || a.budget || 0) - (b.price || b.budget || 0);
            break;
          case 'status':
            comparison = a.status.localeCompare(b.status);
            break;
          case 'date':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
          case 'user':
            comparison = (a.client?.name || '').localeCompare(b.client?.name || '', 'es');
            break;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      pending_payment: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      pending_approval: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      open: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      completed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return badges[status] || badges.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Borrador",
      pending: "Pendiente",
      pending_payment: "Pendiente Pago",
      pending_approval: "Pendiente Aprobación",
      open: "Abierto",
      approved: "Aprobado",
      rejected: "Rechazado",
      in_progress: "En Progreso",
      completed: "Completado",
      cancelled: "Cancelado",
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Real-time connection indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Publicaciones</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Administra y modera todas las publicaciones de trabajo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isConnected ? 'Tiempo real activo' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* New job alert */}
      {newJobAlert && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3 animate-pulse">
          <Bell className="h-5 w-5 text-green-600 dark:text-green-400" />
          <span className="text-green-800 dark:text-green-200 font-medium">{newJobAlert}</span>
          <button
            onClick={() => setNewJobAlert(null)}
            className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200 ${statusFilter === 'all' ? 'ring-2 ring-sky-500' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Publicaciones</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
            <Briefcase className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div
          className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200 hover:bg-yellow-50 dark:hover:bg-yellow-900/10 ${statusFilter === 'pending_approval' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setStatusFilter('pending_approval')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-500 transition-transform group-hover:rotate-12" />
          </div>
        </div>

        <div
          className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200 hover:bg-green-50 dark:hover:bg-green-900/10 ${statusFilter === 'open' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setStatusFilter('open')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Aprobadas</p>
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500 transition-transform group-hover:rotate-12" />
          </div>
        </div>

        <div
          className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-900/10 ${statusFilter === 'cancelled' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setStatusFilter('cancelled')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Rechazadas</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-500 transition-transform group-hover:rotate-12" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título, descripción o usuario..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="all">Todos los estados</option>
              <option value="pending_approval">Pendiente Aprobación</option>
              <option value="open">Abierto (Aprobado)</option>
              <option value="cancelled">Cancelado (Rechazado)</option>
              <option value="in_progress">En Progreso</option>
              <option value="completed">Completado</option>
              <option value="draft">Borrador</option>
            </select>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('title')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Título
                    <SortIcon field="title" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Categoría
                    <SortIcon field="category" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('user')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Usuario
                    <SortIcon field="user" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('budget')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Presupuesto
                    <SortIcon field="budget" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Comprobante
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Estado
                    <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Razón
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Fecha
                    <SortIcon field="date" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {getSortedAndFilteredJobs().length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No se encontraron publicaciones
                  </td>
                </tr>
              ) : (
                getSortedAndFilteredJobs().map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900 dark:text-white">{job.title}</p>
                        <p className="text-gray-500 dark:text-gray-400 truncate max-w-xs">{job.description}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {job.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {job.client?.avatar && (
                          <img src={job.client.avatar} alt="" className="h-8 w-8 rounded-full mr-2" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{job.client?.name || 'N/A'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{job.client?.email || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {job.currency || 'ARS'} ${(job.price || job.budget || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {job.paymentProof ? (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => setSelectedProof(job.paymentProof!)}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {job.paymentProof.fileType === 'pdf' ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <ImageIcon className="w-4 h-4" />
                            )}
                            Ver
                            <span className={`ml-1 px-1.5 py-0.5 text-xs rounded ${
                              job.paymentProof.status === 'approved' ? 'bg-green-100 text-green-700' :
                              job.paymentProof.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {job.paymentProof.status === 'approved' ? 'Aprobado' :
                               job.paymentProof.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                            </span>
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(job.paymentProof.uploadedAt).toLocaleDateString('es-AR')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Sin comprobante</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                      {(job.status === 'cancelled' || job.status === 'rejected') && (job.cancellationReason || job.rejectedReason) ? (
                        <span className="text-red-600 dark:text-red-400 text-xs">
                          {job.cancellationReason || job.rejectedReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(job.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transform hover:scale-110 transition-all duration-150"
                          target="_blank"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {(job.status === 'pending' || job.status === 'pending_approval') && (
                          <>
                            <button
                              onClick={() => handleApprove(job.id)}
                              className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 transform hover:scale-110 transition-all duration-150 hover:rotate-6"
                              title="Aprobar"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleReject(job.id, job.title)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transform hover:scale-110 transition-all duration-150 hover:rotate-6"
                              title="Rechazar"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Proof Modal */}
      {selectedProof && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedProof(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-4xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Comprobante de Pago</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedProof.fileName} • Subido el {new Date(selectedProof.uploadedAt).toLocaleDateString('es-AR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedProof.fileUrl}
                  download={selectedProof.fileName}
                  className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                  title="Descargar"
                >
                  <Download className="w-5 h-5" />
                </a>
                <button
                  onClick={() => setSelectedProof(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Mostrar imagen o PDF */}
            {selectedProof.fileType === 'pdf' ? (
              <div className="w-full">
                <iframe
                  src={selectedProof.fileUrl}
                  className="w-full h-[70vh] rounded border border-gray-200 dark:border-gray-700"
                  title="Comprobante PDF"
                />
                <a
                  href={selectedProof.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Abrir PDF en nueva pestaña
                </a>
              </div>
            ) : (
              <img
                src={selectedProof.fileUrl}
                alt="Comprobante de pago"
                className="w-full h-auto rounded shadow-md"
              />
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setRejectModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Rechazar Publicación</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {rejectModal.jobTitle}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Razón del rechazo (opcional)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 100))}
                placeholder="Ej: Comprobante ilegible, fecha incorrecta..."
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-gray-900 dark:text-white"
                maxLength={100}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {rejectReason.length}/100 caracteres
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmReject}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Rechazar Publicación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
