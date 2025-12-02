import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  DollarSign,
  User,
  ExternalLink,
  Loader2,
  FileText,
} from "lucide-react";

interface EarningRecord {
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
  price: number;
  totalPrice: number;
  commission: number;
  status: string;
  startDate: string;
  endDate: string;
  completedAt?: string;
  createdAt: string;
}

export default function EarningsDetail() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/contracts", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        // Filtrar contratos completados donde el usuario es el doer (recibe pago)
        const completedEarnings = data.contracts.filter(
          (c: any) => c.doer?._id === user?.id && c.status === "completed"
        );

        setEarnings(completedEarnings);
        setTotal(completedEarnings.reduce((sum: number, c: any) => sum + c.price, 0));
      }
    } catch (error) {
      console.error("Error fetching earnings:", error);
    } finally {
      setLoading(false);
    }
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
        <title>Ingresos - Dashboard</title>
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
                  <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-3">
                    <TrendingUp className="h-8 w-8 text-green-500" />
                  </div>
                  Ingresos Totales
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Historial completo de ingresos por contratos completados
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Acumulado</p>
                <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                  ${total.toLocaleString("es-AR")}
                </p>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-sky-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Total de Contratos
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {earnings.length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Ingreso Promedio
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${earnings.length > 0 ? (total / earnings.length).toLocaleString("es-AR", { maximumFractionDigits: 0 }) : 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-violet-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Último Ingreso
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {earnings.length > 0
                      ? new Date(earnings[0].completedAt || earnings[0].endDate).toLocaleDateString("es-AR", { month: "short", day: "numeric" })
                      : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Earnings List */}
          {earnings.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-800 p-12 text-center border border-slate-200 dark:border-slate-700">
              <TrendingUp className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                No hay ingresos registrados
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Completa contratos para empezar a generar ingresos
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors"
              >
                Ver Trabajos Disponibles
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {earnings.map((earning) => (
                <div
                  key={earning._id}
                  className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {earning.job.title}
                        </h3>
                        <Link
                          to={`/contracts/${earning._id}`}
                          className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <User className="h-4 w-4" />
                        <span>Cliente: {earning.client.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        ${earning.price.toLocaleString("es-AR")}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Comisión: ${earning.commission?.toLocaleString("es-AR") || 0}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Fecha de Aceptación
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(earning.createdAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(earning.createdAt).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Fecha de Finalización
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(earning.completedAt || earning.endDate).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(earning.completedAt || earning.endDate).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Duración del Contrato
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {Math.ceil(
                          (new Date(earning.endDate).getTime() -
                            new Date(earning.startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )}{" "}
                        días
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <Link
                      to={`/contracts/${earning._id}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
                    >
                      Ver detalles del contrato
                      <ExternalLink className="h-4 w-4" />
                    </Link>
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
