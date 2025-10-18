import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  TrendingDown,
  Calendar,
  DollarSign,
  User,
  ExternalLink,
  Loader2,
  FileText,
} from "lucide-react";

interface ExpenseRecord {
  _id: string;
  job: {
    _id: string;
    title: string;
  };
  doer: {
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

export default function ExpensesDetail() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/contracts", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        // Filtrar contratos completados donde el usuario es el cliente (paga)
        const completedExpenses = data.contracts.filter(
          (c: any) => c.client?._id === user?.id && c.status === "completed"
        );

        setExpenses(completedExpenses);
        setTotal(completedExpenses.reduce((sum: number, c: any) => sum + c.totalPrice, 0));
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
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
        <title>Gastos - Dashboard</title>
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
                    <TrendingDown className="h-8 w-8 text-red-500" />
                  </div>
                  Gastos Totales
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Historial completo de gastos en contratos completados
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Pagado</p>
                <p className="text-4xl font-bold text-red-600 dark:text-red-400">
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
                    {expenses.length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Gasto Promedio
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${expenses.length > 0 ? (total / expenses.length).toLocaleString("es-AR", { maximumFractionDigits: 0 }) : 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-violet-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Último Gasto
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {expenses.length > 0
                      ? new Date(expenses[0].completedAt || expenses[0].endDate).toLocaleDateString("es-AR", { month: "short", day: "numeric" })
                      : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Expenses List */}
          {expenses.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-800 p-12 text-center border border-slate-200 dark:border-slate-700">
              <TrendingDown className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                No hay gastos registrados
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Cuando contrates profesionales, tus gastos aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {expenses.map((expense) => (
                <div
                  key={expense._id}
                  className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {expense.job.title}
                        </h3>
                        <Link
                          to={`/contracts/${expense._id}`}
                          className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <User className="h-4 w-4" />
                        <span>Profesional: {expense.doer.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        ${expense.totalPrice.toLocaleString("es-AR")}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Base: ${expense.price.toLocaleString("es-AR")} + Comisión: ${expense.commission?.toLocaleString("es-AR") || 0}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Fecha de Contratación
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(expense.createdAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(expense.createdAt).toLocaleTimeString("es-AR", {
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
                        {new Date(expense.completedAt || expense.endDate).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(expense.completedAt || expense.endDate).toLocaleTimeString("es-AR", {
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
                          (new Date(expense.endDate).getTime() -
                            new Date(expense.startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )}{" "}
                        días
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <Link
                      to={`/contracts/${expense._id}`}
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
