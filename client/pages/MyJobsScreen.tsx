import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Briefcase,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Upload,
  Eye,
  MapPin,
  Tag,
} from "lucide-react";

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
  payment?: {
    id: string;
    status: string;
    paymentMethod: string;
    requiresProof?: boolean;
    proofSubmitted?: boolean;
  };
  proposalCount: number;
}

export default function MyJobsScreen() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "pending_payment" | "draft">("all");

  useEffect(() => {
    fetchMyJobs();
  }, []);

  const fetchMyJobs = async () => {
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
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
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
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      published: "Publicado",
      draft: "Borrador",
      pending_payment: "Pendiente de Pago",
      pending_approval: "Pendiente de Aprobación",
      completed: "Completado",
      cancelled: "Cancelado",
    };
    return labels[status] || status;
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
        return job.status === "published";
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

  const filteredJobs = getFilteredJobs();

  // Count jobs by status
  const publishedCount = jobs.filter(j => j.status === "published").length;
  const pendingPaymentCount = jobs.filter(j =>
    j.status === "pending_payment" ||
    (j.payment?.status === "pending" && j.payment?.requiresProof && !j.payment?.proofSubmitted)
  ).length;
  const draftCount = jobs.filter(j => j.status === "draft").length;

  if (loading) {
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Mis Trabajos Publicados
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Administra todos los trabajos que has publicado
          </p>
        </div>

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
              No tienes trabajos{" "}
              {filter === "all"
                ? ""
                : filter === "published"
                ? "publicados"
                : filter === "pending_payment"
                ? "pendientes de pago"
                : "en borrador"}{" "}
              en este momento
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
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(job.createdAt).toLocaleDateString("es-AR")}</span>
                  </div>
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
      </div>
    </div>
  );
}
