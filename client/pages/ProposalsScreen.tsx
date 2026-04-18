import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { SkeletonProposalCard } from "../components/ui/Skeleton";
import { FileText, Calendar, DollarSign, Clock, CheckCircle, XCircle } from "lucide-react";

interface Proposal {
  _id: string;
  job: {
    _id: string;
    title: string;
    price: number;
  };
  freelancer: {
    _id: string;
    name: string;
    avatar: string;
  };
  client: {
    _id: string;
    name: string;
    avatar: string;
  };
  proposedPrice: number;
  price?: number; // legacy field
  coverLetter: string;
  status: string;
  isCounterOffer: boolean;
  originalJobPrice?: number;
  createdAt: string;
}

export default function ProposalsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { registerProposalUpdateHandler } = useSocket();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "sent";
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    fetchProposals();

    // Register real-time event handler
    registerProposalUpdateHandler((data: any) => {
      console.log("📄 Proposal update detected:", data);
      fetchProposals();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/proposals", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setProposals(data.proposals || []);
      }
    } catch (error) {
      console.error("Error fetching proposals:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "withdrawn":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('proposals.status.pending', 'Pendiente'),
      approved: t('proposals.status.approved', 'Aprobada'),
      rejected: t('proposals.status.rejected', 'Rechazada'),
      withdrawn: t('proposals.status.withdrawn', 'Retirada'),
      cancelled: t('proposals.status.cancelled', 'Cancelada'),
    };
    return labels[status] || status;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-5 w-5" />;
      case "rejected":
      case "cancelled":
        return <XCircle className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  // Filtrar propuestas según si son enviadas o recibidas
  const sentProposals = proposals.filter((p) => p.freelancer._id === user?._id);
  const receivedProposals = proposals.filter((p) => p.client._id === user?._id);

  const displayProposals = type === "sent" ? sentProposals : receivedProposals;

  const filteredProposals = displayProposals.filter((proposal) => {
    if (filter === "all") return true;
    return proposal.status === filter;
  });

  // Separar aplicaciones directas y contraofertas
  const directApplications = filteredProposals.filter((p) => !p.isCounterOffer);
  const counterOffers = filteredProposals.filter((p) => p.isCounterOffer);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header Skeleton */}
          <div className="space-y-2">
            <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
          </div>

          {/* Filter Buttons Skeleton */}
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"></div>
            ))}
          </div>

          {/* Proposals Grid Skeleton */}
          <div className="grid gap-6 md:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <SkeletonProposalCard key={i} />
            ))}
          </div>
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
            {type === "sent" ? t('proposals.myProposals', 'Mis Propuestas') : t('proposals.receivedProposals', 'Propuestas Recibidas')}
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {type === "sent"
              ? t('proposals.sentSubtitle', 'Administra las propuestas que has enviado')
              : t('proposals.receivedSubtitle', 'Revisa las propuestas recibidas para tus trabajos')}
          </p>
        </div>

        {/* Type Toggle */}
        <div className="mb-6 flex gap-2">
          <Link
            to="/proposals?type=sent"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              type === "sent"
                ? "bg-sky-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t('proposals.sent', 'Enviadas')}
          </Link>
          <Link
            to="/proposals?type=received"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              type === "received"
                ? "bg-sky-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t('proposals.received', 'Recibidas')}
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "all"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t('common.all', 'Todas')}
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "pending"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t('proposals.filter.pending', 'Pendientes')}
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "approved"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t('proposals.filter.approved', 'Aprobadas')}
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "rejected"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {t('proposals.filter.rejected', 'Rechazadas')}
          </button>
        </div>

        {/* Proposals List */}
        {filteredProposals.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              {t('proposals.noProposals', 'No tienes propuestas en este momento')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Counter Offers Section */}
            {counterOffers.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <DollarSign className="h-6 w-6 text-sky-600" />
                  {t('proposals.counterOffers', 'Contraofertas')} ({counterOffers.length})
                </h2>
                <div className="space-y-4">
                  {counterOffers.map((proposal) => {
                    const otherParty = type === "sent" ? proposal.client : proposal.freelancer;
                    const price = proposal.proposedPrice || proposal.price || 0;

                    return (
                      <Link
                        key={proposal._id}
                        to={`/proposals/${proposal._id}`}
                        className="block bg-white dark:bg-slate-800 rounded-xl border-2 border-sky-200 dark:border-sky-800 p-6 hover:shadow-lg transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400">
                              {proposal.job.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-semibold rounded">
                                {t('proposals.counterOffer', 'CONTRAOFERTA')}
                              </span>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(
                                  proposal.status
                                )}`}
                              >
                                {getStatusIcon(proposal.status)}
                                {getStatusLabel(proposal.status)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-sky-600">
                              ${price.toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t('proposals.yourOffer', 'Tu oferta')}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              {t('proposals.original', 'Original')}: ${proposal.job.price.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {/* Cover Letter */}
                        <div className="mb-4 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                            {proposal.coverLetter}
                          </p>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-2">
                            <img
                              src={otherParty.avatar}
                              alt={otherParty.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                            <span>
                              {type === "sent" ? t('proposals.client', 'Cliente') + ": " : t('proposals.freelancer', 'Freelancer') + ": "}
                              {otherParty.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {new Date(proposal.createdAt).toLocaleDateString("es-AR")}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Direct Applications Section */}
            {directApplications.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <FileText className="h-6 w-6 text-violet-600" />
                  {t('proposals.directApplications', 'Aplicaciones Directas')} ({directApplications.length})
                </h2>
                <div className="space-y-4">
                  {directApplications.map((proposal) => {
                    const otherParty = type === "sent" ? proposal.client : proposal.freelancer;
                    const price = proposal.proposedPrice || proposal.price || 0;

                    return (
                      <Link
                        key={proposal._id}
                        to={`/proposals/${proposal._id}`}
                        className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400">
                              {proposal.job.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-2">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(
                                  proposal.status
                                )}`}
                              >
                                {getStatusIcon(proposal.status)}
                                {getStatusLabel(proposal.status)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-violet-600">
                              ${price.toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t('proposals.jobPrice', 'Precio del trabajo')}
                            </p>
                          </div>
                        </div>

                        {/* Cover Letter */}
                        <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                            {proposal.coverLetter}
                          </p>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-2">
                            <img
                              src={otherParty.avatar}
                              alt={otherParty.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                            <span>
                              {type === "sent" ? t('proposals.client', 'Cliente') + ": " : t('proposals.freelancer', 'Freelancer') + ": "}
                              {otherParty.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {new Date(proposal.createdAt).toLocaleDateString("es-AR")}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
