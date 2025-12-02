import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  FileText,
  Calendar,
  DollarSign,
  User,
  ExternalLink,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface Proposal {
  _id: string;
  job: {
    _id: string;
    title: string;
    price: number;
  };
  client: {
    _id: string;
    name: string;
    avatar?: string;
  };
  freelancer: {
    _id: string;
    name: string;
    avatar?: string;
  };
  proposedPrice: number;
  estimatedDuration: number;
  coverLetter: string;
  status: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProposalsDetail() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const filterStatus = searchParams.get("status") || "all";
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(filterStatus);

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/proposals?type=sent", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setProposals(data.proposals);
      }
    } catch (error) {
      console.error("Error fetching proposals:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; icon: any; className: string }> = {
      pending: {
        label: "Pendiente",
        icon: Clock,
        className: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
      },
      approved: {
        label: "Aprobada",
        icon: CheckCircle,
        className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
      },
      rejected: {
        label: "Rechazada",
        icon: XCircle,
        className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
      },
      withdrawn: {
        label: "Retirada",
        icon: XCircle,
        className: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400",
      },
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const filteredProposals = proposals.filter((p) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "rejected") return p.status === "rejected" || p.status === "withdrawn";
    return p.status === activeFilter;
  });

  const filters = [
    { value: "all", label: "Todas", count: proposals.length },
    { value: "pending", label: "Pendientes", count: proposals.filter((p) => p.status === "pending").length },
    { value: "approved", label: "Aprobadas", count: proposals.filter((p) => p.status === "approved").length },
    { value: "rejected", label: "Rechazadas", count: proposals.filter((p) => p.status === "rejected" || p.status === "withdrawn").length },
  ];

  const getIcon = () => {
    if (activeFilter === "pending") return Clock;
    if (activeFilter === "approved") return CheckCircle;
    if (activeFilter === "rejected") return XCircle;
    return FileText;
  };

  const getColor = () => {
    if (activeFilter === "pending") return "amber";
    if (activeFilter === "approved") return "green";
    if (activeFilter === "rejected") return "red";
    return "violet";
  };

  const Icon = getIcon();
  const color = getColor();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Mis Propuestas - Dashboard</title>
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            {/* Back button - Only visible on mobile */}
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <div className={`rounded-full bg-${color}-100 dark:bg-${color}-900/20 p-3`}>
                    <Icon className={`h-8 w-8 text-${color}-500`} />
                  </div>
                  Mis Propuestas
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Historial completo de propuestas enviadas
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Enviadas</p>
                <p className={`text-4xl font-bold text-${color}-600 dark:text-${color}-400`}>
                  {proposals.length}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 flex gap-2 flex-wrap">
            {filters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === filter.value
                    ? "bg-sky-600 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>

          {/* Stats Summary */}
          <div className="grid gap-6 md:grid-cols-4 mb-8">
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Pendientes</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {proposals.filter((p) => p.status === "pending").length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Aprobadas</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {proposals.filter((p) => p.status === "approved").length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Rechazadas</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {proposals.filter((p) => p.status === "rejected" || p.status === "withdrawn").length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-violet-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Valor Total</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${proposals.reduce((sum, p) => sum + p.proposedPrice, 0).toLocaleString("es-AR")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Proposals List */}
          {filteredProposals.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-800 p-12 text-center border border-slate-200 dark:border-slate-700">
              <FileText className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                No hay propuestas {activeFilter !== "all" && filters.find((f) => f.value === activeFilter)?.label.toLowerCase()}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                {activeFilter === "all"
                  ? "Aplica a trabajos para enviar tu primera propuesta"
                  : "Cambia el filtro para ver otras propuestas"}
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors"
              >
                Buscar Trabajos
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProposals.map((proposal) => (
                <div
                  key={proposal._id}
                  className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {proposal.job.title}
                        </h3>
                        {getStatusBadge(proposal.status)}
                        <Link
                          to={`/jobs/${proposal.job._id}`}
                          className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <User className="h-4 w-4" />
                        <span>Cliente: {proposal.client.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Precio Original
                      </div>
                      <div className="text-sm line-through text-slate-400">
                        ${proposal.job.price.toLocaleString("es-AR")}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 mb-1">
                        Tu Propuesta
                      </div>
                      <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                        ${proposal.proposedPrice.toLocaleString("es-AR")}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {proposal.estimatedDuration} días
                      </div>
                    </div>
                  </div>

                  {/* Cover Letter */}
                  <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      Carta de Presentación
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">
                      {proposal.coverLetter}
                    </p>
                  </div>

                  {/* Rejection Reason */}
                  {proposal.rejectionReason && (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 dark:text-red-400 mb-2 font-medium">
                        Motivo de Rechazo
                      </p>
                      <p className="text-sm text-red-800 dark:text-red-300">
                        {proposal.rejectionReason}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Fecha de Envío
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(proposal.createdAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(proposal.createdAt).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Última Actualización
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(proposal.updatedAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(proposal.updatedAt).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Diferencia de Precio
                      </p>
                      <p className={`text-sm font-medium ${
                        proposal.proposedPrice < proposal.job.price
                          ? "text-green-600 dark:text-green-400"
                          : proposal.proposedPrice > proposal.job.price
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-600 dark:text-slate-400"
                      }`}>
                        {proposal.proposedPrice < proposal.job.price ? "-" : "+"}
                        ${Math.abs(proposal.proposedPrice - proposal.job.price).toLocaleString("es-AR")}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {proposal.proposedPrice < proposal.job.price
                          ? "Menor que original"
                          : proposal.proposedPrice > proposal.job.price
                          ? "Mayor que original"
                          : "Igual que original"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
