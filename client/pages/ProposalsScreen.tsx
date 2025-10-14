import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
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
  price: number;
  coverLetter: string;
  status: string;
  createdAt: string;
}

export default function ProposalsScreen() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "sent";
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    fetchProposals();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando propuestas...</p>
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
            {type === "sent" ? "Mis Propuestas" : "Propuestas Recibidas"}
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {type === "sent"
              ? "Administra las propuestas que has enviado"
              : "Revisa las propuestas recibidas para tus trabajos"}
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
            Enviadas
          </Link>
          <Link
            to="/proposals?type=received"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              type === "received"
                ? "bg-sky-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Recibidas
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
            Todas
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "pending"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "approved"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Aprobadas
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "rejected"
                ? "bg-violet-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Rechazadas
          </button>
        </div>

        {/* Proposals List */}
        {filteredProposals.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              No tienes propuestas{" "}
              {filter === "all" ? "" : filter === "pending" ? "pendientes" : filter === "approved" ? "aprobadas" : "rechazadas"}{" "}
              en este momento
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProposals.map((proposal) => {
              const otherParty = type === "sent" ? proposal.client : proposal.freelancer;

              return (
                <div
                  key={proposal._id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <Link
                        to={`/jobs/${proposal.job._id}`}
                        className="text-lg font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400"
                      >
                        {proposal.job.title}
                      </Link>
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
                        ${proposal.price.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Precio propuesto
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Original: ${proposal.job.price.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Cover Letter */}
                  <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
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
                        {type === "sent" ? "Cliente: " : "Freelancer: "}
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
