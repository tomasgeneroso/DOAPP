import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft,
  FileText,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  XCircle,
  MessageCircle,
} from "lucide-react";
import MultipleRatings from "../components/user/MultipleRatings";

interface Proposal {
  _id: string;
  job: {
    _id: string;
    title: string;
    summary: string;
    price: number;
    location: string;
    category: string;
  };
  freelancer: {
    _id: string;
    name: string;
    avatar: string;
    rating?: number;
    reviewsCount?: number;
    completedJobs?: number;
  };
  client: {
    _id: string;
    name: string;
    avatar: string;
  };
  proposedPrice: number;
  estimatedDuration: number;
  coverLetter: string;
  status: string;
  isCounterOffer: boolean;
  originalJobPrice?: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadProposal();
    }
  }, [id]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setProposal(data.proposal);
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
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
      pending: "Pendiente",
      approved: "Aprobada",
      rejected: "Rechazada",
      withdrawn: "Retirada",
      cancelled: "Cancelada",
    };
    return labels[status] || status;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-6 w-6" />;
      case "rejected":
      case "cancelled":
        return <XCircle className="h-6 w-6" />;
      default:
        return <Clock className="h-6 w-6" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Propuesta no encontrada
          </h2>
          <button
            onClick={() => navigate("/proposals")}
            className="mt-4 text-sky-600 hover:text-sky-700"
          >
            Volver a Propuestas
          </button>
        </div>
      </div>
    );
  }

  const isFreelancer = proposal.freelancer._id === user?._id;
  const isClient = proposal.client._id === user?._id;
  const otherParty = isFreelancer ? proposal.client : proposal.freelancer;

  return (
    <>
      <Helmet>
        <title>
          {proposal.isCounterOffer ? "Contraoferta" : "Aplicación"} -{" "}
          {proposal.job.title} - Do
        </title>
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button - Only visible on mobile */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver
          </button>

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {proposal.isCounterOffer && (
                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-sm font-bold rounded">
                      CONTRAOFERTA
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${getStatusColor(
                      proposal.status
                    )}`}
                  >
                    {getStatusIcon(proposal.status)}
                    {getStatusLabel(proposal.status)}
                  </span>
                </div>
                <Link
                  to={`/jobs/${proposal.job._id}`}
                  className="text-2xl font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400"
                >
                  {proposal.job.title}
                </Link>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  {proposal.job.summary}
                </p>
              </div>
            </div>

            {/* Price Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  Precio Original
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  ${proposal.job.price.toLocaleString()}
                </p>
              </div>
              <div className={`${proposal.isCounterOffer ? "bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-500" : "bg-slate-50 dark:bg-slate-900/50"} rounded-lg p-4`}>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  {proposal.isCounterOffer ? "Tu Contraoferta" : "Precio Propuesto"}
                </p>
                <p className={`text-2xl font-bold ${proposal.isCounterOffer ? "text-sky-600" : "text-slate-900 dark:text-white"}`}>
                  ${proposal.proposedPrice.toLocaleString()}
                </p>
              </div>
              {proposal.isCounterOffer && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Diferencia
                  </p>
                  <p className={`text-2xl font-bold ${proposal.proposedPrice < proposal.job.price ? "text-green-600" : "text-red-600"}`}>
                    {proposal.proposedPrice < proposal.job.price ? "-" : "+"}$
                    {Math.abs(proposal.proposedPrice - proposal.job.price).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cover Letter / Message */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-600" />
              {proposal.isCounterOffer ? "Mensaje de la Contraoferta" : "Carta de Presentación"}
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {proposal.coverLetter}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Parties */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-sky-600" />
                Partes
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    Freelancer
                  </p>
                  <div className="flex items-center gap-3">
                    <img
                      src={proposal.freelancer.avatar}
                      alt={proposal.freelancer.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {proposal.freelancer.name}
                      </p>
                      {proposal.freelancer.rating && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          ⭐ {(Number(proposal.freelancer.rating) || 0).toFixed(1)} ({proposal.freelancer.reviewsCount || 0} reviews)
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Multiple Ratings for Freelancer */}
                  <div className="mt-3">
                    <MultipleRatings user={proposal.freelancer as any} size="sm" />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Cliente</p>
                  <div className="flex items-center gap-3">
                    <img
                      src={proposal.client.avatar}
                      alt={proposal.client.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <p className="font-medium text-slate-900 dark:text-white">
                      {proposal.client.name}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Job Details */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-600" />
                Detalles
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Categoría</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {proposal.job.category}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Ubicación</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {proposal.job.location}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Duración Estimada
                  </p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {proposal.estimatedDuration} días
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Fecha de Envío</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {new Date(proposal.createdAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Rejection Reason */}
          {proposal.status === "rejected" && proposal.rejectionReason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Razón del Rechazo
              </h2>
              <p className="text-red-800 dark:text-red-300">{proposal.rejectionReason}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <Link
              to={`/jobs/${proposal.job._id}`}
              className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition font-semibold"
            >
              <FileText className="h-5 w-5" />
              Ver Trabajo
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
