import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  DollarSign,
  User,
  ExternalLink,
  Loader2,
  Clock,
  AlertCircle,
} from "lucide-react";

interface ActiveContract {
  _id: string;
  job: {
    _id: string;
    title: string;
  };
  client: {
    _id: string;
    name: string;
    avatar?: string;
  };
  doer: {
    _id: string;
    name: string;
    avatar?: string;
  };
  price: number;
  totalPrice: number;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  type: string;
}

export default function ActiveContractsDetail() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<ActiveContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveContracts();
  }, []);

  const fetchActiveContracts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/contracts", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        // Filtrar contratos activos (pending, accepted, in_progress)
        const activeContracts = data.contracts.filter(
          (c: any) =>
            (c.client?._id === user?.id || c.doer?._id === user?.id) &&
            (c.status === "pending" || c.status === "accepted" || c.status === "in_progress")
        );

        setContracts(activeContracts);
      }
    } catch (error) {
      console.error("Error fetching active contracts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      pending: {
        label: "Pendiente",
        className: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
      },
      accepted: {
        label: "Aceptado",
        className: "bg-sky-100 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400",
      },
      in_progress: {
        label: "En Progreso",
        className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
      },
    };

    const badge = badges[status] || badges.pending;
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  const getDaysRemaining = (endDate: string) => {
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days < 0) return { text: "Vencido", color: "text-red-600" };
    if (days === 0) return { text: "Hoy", color: "text-amber-600" };
    if (days === 1) return { text: "Mañana", color: "text-amber-600" };
    if (days <= 7) return { text: `${days} días`, color: "text-amber-600" };
    return { text: `${days} días`, color: "text-slate-600" };
  };

  const getUserRole = (contract: ActiveContract) => {
    if (contract.client._id === user?.id) return "cliente";
    if (contract.doer._id === user?.id) return "doer";
    return "unknown";
  };

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
        <title>Contratos Activos - Dashboard</title>
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
                  <div className="rounded-full bg-sky-100 dark:bg-sky-900/20 p-3">
                    <Briefcase className="h-8 w-8 text-sky-500" />
                  </div>
                  Contratos Activos
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Contratos en curso o pendientes de inicio
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Activos</p>
                <p className="text-4xl font-bold text-sky-600 dark:text-sky-400">
                  {contracts.length}
                </p>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Pendientes</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {contracts.filter((c) => c.status === "pending").length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">En Progreso</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {contracts.filter((c) => c.status === "in_progress").length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Briefcase className="h-8 w-8 text-sky-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Aceptados</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {contracts.filter((c) => c.status === "accepted").length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contracts List */}
          {contracts.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-800 p-12 text-center border border-slate-200 dark:border-slate-700">
              <Briefcase className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                No tienes contratos activos
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Cuando tengas contratos en curso aparecerán aquí
              </p>
              <Link
                to="/contracts"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors"
              >
                Ver Todos los Contratos
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {contracts.map((contract) => {
                const role = getUserRole(contract);
                const remaining = getDaysRemaining(contract.endDate);
                const isClient = role === "cliente";

                return (
                  <div
                    key={contract._id}
                    className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {contract.job.title}
                          </h3>
                          {getStatusBadge(contract.status)}
                          <Link
                            to={`/contracts/${contract._id}`}
                            className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>
                              {isClient ? "Profesional" : "Cliente"}:{" "}
                              {isClient ? contract.doer.name : contract.client.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700">
                              {isClient ? "Contratado por ti" : "Trabajas aquí"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                          ${isClient ? contract.totalPrice.toLocaleString("es-AR") : contract.price.toLocaleString("es-AR")}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {isClient ? "(Total con comisión)" : "(Tu pago)"}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Creado
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {new Date(contract.createdAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Inicio
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {new Date(contract.startDate).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(contract.startDate).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Fin Programado
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {new Date(contract.endDate).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(contract.endDate).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Tiempo Restante
                        </p>
                        <p className={`text-sm font-medium ${remaining.color} dark:${remaining.color}`}>
                          {remaining.text}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <Link
                        to={`/contracts/${contract._id}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
                      >
                        Ver detalles del contrato
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      {contract.status === "in_progress" && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Contrato en curso
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
