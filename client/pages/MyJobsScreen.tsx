import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import {
  Briefcase,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Upload,
  Eye,
  MapPin,
  Tag,
  Wifi,
  WifiOff,
  Send,
  CalendarDays,
  List,
} from "lucide-react";
import JobsCalendar from "../components/jobs/JobsCalendar";

interface Job {
  id: string;
  title: string;
  description: string;
  price: number;
  status: string;
  category: string;
  location: string;
  tags: string[];
  createdAt: string;
  startDate: string;
  endDate?: string;
  payment?: {
    id: string;
    status: string;
    paymentMethod: string;
    requiresProof?: boolean;
    proofSubmitted?: boolean;
  };
  proposalCount: number;
}

interface Proposal {
  id: string;
  status: string;
  proposedPrice: number;
  coverLetter: string;
  createdAt: string;
  job: {
    id: string;
    title: string;
    description: string;
    price: number;
    status: string;
    category: string;
    location: string;
    startDate: string;
    endDate?: string;
  };
}

type MainTab = "published" | "applied";
type ViewMode = "list" | "calendar";

export default function MyJobsScreen() {
  const { user, token } = useAuth();
  const { isConnected, registerJobUpdateHandler, registerMyJobsRefreshHandler, registerJobsRefreshHandler, registerNewProposalHandler } = useSocket();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    const tabParam = searchParams.get("tab");
    return tabParam === "applied" ? "applied" : "published";
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const viewParam = searchParams.get("view");
    return viewParam === "calendar" ? "calendar" : "list";
  });
  const [filter, setFilter] = useState<"all" | "published" | "pending_payment" | "draft">("all");
  const [proposalFilter, setProposalFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const fetchMyJobs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/jobs/my-jobs", {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("❌ Error fetching my jobs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyProposals = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingProposals(true);
      const response = await fetch("/api/proposals?type=sent", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setProposals(data.proposals || []);
      }
    } catch (error) {
      console.error("❌ Error fetching proposals:", error);
    } finally {
      setLoadingProposals(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMyJobs();
  }, [fetchMyJobs]);

  useEffect(() => {
    fetchMyProposals();
  }, [fetchMyProposals]);

  // Register socket handlers for real-time updates
  useEffect(() => {
    // Handler for individual job updates
    registerJobUpdateHandler((data: any) => {
      console.log("💼 MyJobsScreen: Job updated via socket:", data);
      const jobId = data.jobId || data.job?.id;
      setJobs(prev => {
        const jobExists = prev.some(job => job.id === jobId);
        if (jobExists) {
          console.log("🔄 MyJobsScreen: Refreshing jobs list...");
          fetchMyJobs();
        }
        return prev;
      });
      // Also refresh proposals in case job status changed
      fetchMyProposals();
    });

    // Handler for my jobs refresh
    registerMyJobsRefreshHandler((data: any) => {
      console.log("🔄 MyJobsScreen: My jobs refresh triggered via socket");
      fetchMyJobs();
      fetchMyProposals();
    });

    // Also listen to general jobs refresh
    registerJobsRefreshHandler((data: any) => {
      console.log("🔄 MyJobsScreen: Jobs refresh triggered via socket");
      fetchMyJobs();
      fetchMyProposals();
    });

    // Handler for new proposals on my jobs
    registerNewProposalHandler((data: any) => {
      console.log("📝 MyJobsScreen: New proposal received via socket:", data);
      fetchMyJobs();
      fetchMyProposals();
    });
  }, [fetchMyJobs, fetchMyProposals, registerJobUpdateHandler, registerMyJobsRefreshHandler, registerJobsRefreshHandler, registerNewProposalHandler]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
      case "open":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "draft":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
      case "pending_payment":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
      case "pending_approval":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400";
      case "completed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "in_progress":
        return "bg-sky-100 text-sky-800 dark:bg-sky-900/20 dark:text-sky-400";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      published: "Publicado",
      open: "Abierto",
      draft: "Borrador",
      pending_payment: "Pendiente de Pago",
      pending_approval: "Pendiente de Aprobación",
      completed: "Completado",
      cancelled: "Cancelado",
      in_progress: "En Progreso",
      pending: "Pendiente",
      approved: "Aprobada",
      rejected: "Rechazada",
    };
    return labels[status] || status;
  };

  const getProposalStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const getPaymentStatusBadge = (job: Job) => {
    if (!job.payment) return null;

    const { status, requiresProof, proofSubmitted } = job.payment;

    if (status === "pending" && requiresProof && !proofSubmitted) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 rounded-full text-xs font-medium">
          <Upload className="h-3 w-3" />
          <span>Subir Comprobante</span>
        </div>
      );
    }

    if (status === "pending" && requiresProof && proofSubmitted) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 bg-sky-100 dark:bg-sky-900/20 text-sky-800 dark:text-sky-400 rounded-full text-xs font-medium">
          <Clock className="h-3 w-3" />
          <span>Pago en Revisión</span>
        </div>
      );
    }

    if (status === "approved" || status === "completed") {
      return (
        <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 rounded-full text-xs font-medium">
          <CheckCircle className="h-3 w-3" />
          <span>Pago Aprobado</span>
        </div>
      );
    }

    if (status === "pending") {
      return (
        <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 rounded-full text-xs font-medium">
          <AlertCircle className="h-3 w-3" />
          <span>Pago Pendiente</span>
        </div>
      );
    }

    return null;
  };

  const getFilteredJobs = () => {
    return jobs.filter((job) => {
      if (filter === "published") {
        return job.status === "published" || job.status === "open";
      }
      if (filter === "pending_payment") {
        return job.status === "pending_payment" ||
               (job.payment?.status === "pending" &&
                job.payment?.requiresProof &&
                !job.payment?.proofSubmitted);
      }
      if (filter === "draft") {
        return job.status === "draft";
      }
      return true;
    });
  };

  const getFilteredProposals = () => {
    return proposals.filter((proposal) => {
      if (proposalFilter === "pending") return proposal.status === "pending";
      if (proposalFilter === "approved") return proposal.status === "approved";
      if (proposalFilter === "rejected") return proposal.status === "rejected";
      return true;
    });
  };

  const filteredJobs = getFilteredJobs();
  const filteredProposals = getFilteredProposals();

  // Count jobs by status
  const publishedCount = jobs.filter(j => j.status === "published" || j.status === "open").length;
  const pendingPaymentCount = jobs.filter(j =>
    j.status === "pending_payment" ||
    (j.payment?.status === "pending" && j.payment?.requiresProof && !j.payment?.proofSubmitted)
  ).length;
  const draftCount = jobs.filter(j => j.status === "draft").length;

  // Count proposals by status
  const pendingProposalsCount = proposals.filter(p => p.status === "pending").length;
  const approvedProposalsCount = proposals.filter(p => p.status === "approved").length;
  const rejectedProposalsCount = proposals.filter(p => p.status === "rejected").length;

  // Transform data for calendar - real-time synced with jobs/proposals state
  const calendarJobs = mainTab === "published"
    ? filteredJobs.map(job => ({
        id: job.id,
        title: job.title,
        description: job.description,
        price: job.price,
        category: job.category,
        location: job.location,
        startDate: job.startDate || job.createdAt,
        endDate: job.endDate,
        status: job.status,
      }))
    : filteredProposals.map(p => ({
        id: p.job.id,
        title: p.job.title,
        description: p.job.description,
        price: p.proposedPrice || p.job.price,
        category: p.job.category,
        location: p.job.location,
        startDate: p.job.startDate,
        endDate: p.job.endDate,
        status: p.job.status,
        proposalStatus: p.status,
      }));

  if (loading && loadingProposals) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando trabajos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Mis Trabajos
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Administra tus trabajos publicados y postulaciones
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 ${viewMode === "list" ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Vista de lista"
              >
                <List className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`p-2 border-l border-slate-200 dark:border-slate-700 ${viewMode === "calendar" ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Vista de calendario"
              >
                <CalendarDays className="h-5 w-5" />
              </button>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2 text-sm">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">Tiempo real</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-500">Sin conexión</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setMainTab("published")}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
              mainTab === "published"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Briefcase className="h-5 w-5" />
            Mis Publicaciones ({jobs.length})
          </button>
          <button
            onClick={() => setMainTab("applied")}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
              mainTab === "applied"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Send className="h-5 w-5" />
            Mis Postulaciones ({proposals.length})
          </button>
        </div>

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <JobsCalendar
            jobs={calendarJobs}
            title={mainTab === "published" ? "Calendario de Publicaciones" : "Calendario de Postulaciones"}
          />
        )}

        {/* List View - Published Jobs */}
        {viewMode === "list" && mainTab === "published" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{jobs.length}</p>
                  </div>
                  <Briefcase className="h-8 w-8 text-slate-400" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Publicados</p>
                    <p className="text-2xl font-bold text-green-600">{publishedCount}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Pago Pendiente</p>
                    <p className="text-2xl font-bold text-amber-600">{pendingPaymentCount}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Borradores</p>
                    <p className="text-2xl font-bold text-slate-600">{draftCount}</p>
                  </div>
                  <FileText className="h-8 w-8 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === "all"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Todos ({jobs.length})
              </button>
              <button
                onClick={() => setFilter("published")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === "published"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Publicados ({publishedCount})
              </button>
              <button
                onClick={() => setFilter("pending_payment")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === "pending_payment"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Pago Pendiente ({pendingPaymentCount})
              </button>
              <button
                onClick={() => setFilter("draft")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === "draft"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Borradores ({draftCount})
              </button>
            </div>

            {/* Jobs List */}
            {filteredJobs.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <Briefcase className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  No tienes trabajos en este momento
                </p>
                <Link
                  to="/create-job"
                  className="mt-4 inline-block px-6 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors"
                >
                  Publicar Trabajo
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-3 mb-2">
                          <Link
                            to={`/jobs/${job.id}`}
                            className="text-lg font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            {job.title}
                          </Link>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                          {job.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                            {getStatusLabel(job.status)}
                          </span>
                          {getPaymentStatusBadge(job)}
                          {job.category && (
                            <div className="flex items-center gap-1 px-3 py-1 bg-sky-100 dark:bg-sky-900/20 text-sky-800 dark:text-sky-400 rounded-full text-xs">
                              <Tag className="h-3 w-3" />
                              <span>{job.category}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-2xl font-bold text-sky-600">
                          ${job.price.toLocaleString()} ARS
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Precio</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400 mb-4">
                      {job.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{job.location}</span>
                        </div>
                      )}
                      {job.startDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(job.startDate).toLocaleDateString("es-AR")}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        <span>{job.proposalCount} propuestas</span>
                      </div>
                    </div>

                    {/* Tags */}
                    {job.tags && job.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {job.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <Link
                        to={`/jobs/${job.id}`}
                        className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        <Eye className="h-4 w-4" />
                        Ver Detalles
                      </Link>

                      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                        job.proposalCount > 0
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-600'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        <FileText className="h-4 w-4" />
                        <span>{job.proposalCount} {job.proposalCount === 1 ? 'postulado' : 'postulados'}</span>
                      </div>

                      {job.payment?.requiresProof && !job.payment?.proofSubmitted && (
                        <Link
                          to={`/jobs/${job.id}/payment`}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors text-sm"
                        >
                          <Upload className="h-4 w-4" />
                          Subir Comprobante
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* List View - Proposals */}
        {viewMode === "list" && mainTab === "applied" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{proposals.length}</p>
                  </div>
                  <Send className="h-8 w-8 text-slate-400" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Pendientes</p>
                    <p className="text-2xl font-bold text-amber-600">{pendingProposalsCount}</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Aprobadas</p>
                    <p className="text-2xl font-bold text-green-600">{approvedProposalsCount}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Rechazadas</p>
                    <p className="text-2xl font-bold text-red-600">{rejectedProposalsCount}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-500" />
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setProposalFilter("all")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  proposalFilter === "all"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Todas ({proposals.length})
              </button>
              <button
                onClick={() => setProposalFilter("pending")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  proposalFilter === "pending"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Pendientes ({pendingProposalsCount})
              </button>
              <button
                onClick={() => setProposalFilter("approved")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  proposalFilter === "approved"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Aprobadas ({approvedProposalsCount})
              </button>
              <button
                onClick={() => setProposalFilter("rejected")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  proposalFilter === "rejected"
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                Rechazadas ({rejectedProposalsCount})
              </button>
            </div>

            {/* Proposals List */}
            {loadingProposals ? (
              <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto"></div>
                <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando postulaciones...</p>
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <Send className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  No tienes postulaciones {proposalFilter !== "all" ? `${getStatusLabel(proposalFilter).toLowerCase()}s` : ""}
                </p>
                <Link
                  to="/"
                  className="mt-4 inline-block px-6 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors"
                >
                  Explorar Trabajos
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-3 mb-2">
                          <Link
                            to={`/jobs/${proposal.job.id}`}
                            className="text-lg font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            {proposal.job.title}
                          </Link>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                          {proposal.job.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getProposalStatusColor(proposal.status)}`}>
                            Propuesta {getStatusLabel(proposal.status)}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(proposal.job.status)}`}>
                            Trabajo {getStatusLabel(proposal.job.status)}
                          </span>
                          {proposal.job.category && (
                            <div className="flex items-center gap-1 px-3 py-1 bg-sky-100 dark:bg-sky-900/20 text-sky-800 dark:text-sky-400 rounded-full text-xs">
                              <Tag className="h-3 w-3" />
                              <span>{proposal.job.category}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-2xl font-bold text-sky-600">
                          ${proposal.proposedPrice.toLocaleString()} ARS
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Tu oferta</p>
                        {proposal.proposedPrice !== proposal.job.price && (
                          <p className="text-xs text-slate-400 line-through">
                            ${proposal.job.price.toLocaleString()} original
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400 mb-4">
                      {proposal.job.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{proposal.job.location}</span>
                        </div>
                      )}
                      {proposal.job.startDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Inicio: {new Date(proposal.job.startDate).toLocaleDateString("es-AR")}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>Enviada: {new Date(proposal.createdAt).toLocaleDateString("es-AR")}</span>
                      </div>
                    </div>

                    {/* Cover Letter Preview */}
                    {proposal.coverLetter && (
                      <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tu mensaje:</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                          {proposal.coverLetter}
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <Link
                        to={`/jobs/${proposal.job.id}`}
                        className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        <Eye className="h-4 w-4" />
                        Ver Trabajo
                      </Link>
                      <button
                        onClick={() => setViewMode("calendar")}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-colors text-sm"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Ver en Calendario
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
