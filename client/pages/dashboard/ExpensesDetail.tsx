import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  TrendingDown,
  Calendar,
  DollarSign,
  ExternalLink,
  Loader2,
  FileText,
} from "lucide-react";

/**
 * Lo que la persona pagó en la plataforma: publicaciones, contratos, aumentos de presupuesto y membresía.
 *
 * Antes esta pantalla listaba solo contratos COMPLETADOS (y el tablero sumaba lo mismo): quien ya había pagado un trabajo todavía en curso veía «No
 * hay gastos registrados» y «$0». Ahora sale de los pagos acreditados (`GET /api/balance/gastado`), con el concepto y el estado en español.
 */

interface Gasto {
  id: string;
  fecha: string;
  concepto: string;
  descripcion: string | null;
  estado: string;
  montoEnPesos: number | null;
  contractId: string | null;
}

interface Respuesta {
  success: boolean;
  totalGastado?: number;
  pagos?: number;
  pagosSinEquivalenteEnPesos?: number;
  /** Pagos cuyo comprobante todavía se está revisando: NO suman al total hasta que se confirme la plata. */
  enRevision?: { pagos: number; total: number };
  detalle?: Gasto[];
}

const pesos = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

export default function ExpensesDetail() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const response = await fetch("/api/balance/gastado", {
          credentials: "include",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const cuerpo: Respuesta = await response.json().catch(() => ({ success: false }));
        if (cancelado) return;
        if (!response.ok || !cuerpo.success) throw new Error("No se pudieron leer tus gastos. Probá de nuevo en un momento.");
        setDatos(cuerpo);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudieron leer tus gastos.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  const gastos = datos?.detalle ?? [];
  const total = datos?.totalGastado ?? 0;
  const cantidad = datos?.pagos ?? 0;

  return (
    <>
      <Helmet>
        <title>Gastos - Dashboard</title>
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al Dashboard
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
                    <TrendingDown className="h-8 w-8 text-red-500" />
                  </div>
                  Gastos Totales
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Todo lo que pagaste: publicaciones, contratos, aumentos de presupuesto y membresía (aunque el trabajo todavía esté en curso).
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 dark:text-slate-400">Total pagado</p>
                <p className="text-4xl font-bold text-red-600 dark:text-red-400">{pesos(total)}</p>
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </p>
          )}

          {!error && (datos?.enRevision?.pagos ?? 0) > 0 && (
            <p role="status" className="mb-6 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
              Tenés {datos?.enRevision?.pagos} pago(s) en revisión por {pesos(datos?.enRevision?.total ?? 0)}: todavía no se confirmó que la plata entró, así que no figuran en el total. Se suman solos cuando se confirmen.
            </p>
          )}

          {!error && (datos?.pagosSinEquivalenteEnPesos ?? 0) > 0 && (
            <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              {datos?.pagosSinEquivalenteEnPesos} pago(s) hechos en otra moneda no figuran en el total porque no tienen su equivalente en pesos guardado.
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-sky-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Pagos realizados</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{cantidad}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Gasto promedio</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{cantidad > 0 ? pesos(Math.round(total / cantidad)) : "$0"}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-violet-500" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Último gasto</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {gastos.length > 0 ? new Date(gastos[0].fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "Todavía no hay"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {gastos.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-800 p-12 text-center border border-slate-200 dark:border-slate-700">
              <TrendingDown className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No hay gastos registrados</h3>
              <p className="text-slate-600 dark:text-slate-400">Cuando pagues una publicación, un contrato o la membresía, vas a verlo acá.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {gastos.map((g) => (
                <li key={g.id} className="rounded-xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{g.concepto}</h3>
                      {g.descripcion && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{g.descripcion}</p>}
                      <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{g.estado}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">{g.montoEnPesos === null ? "—" : pesos(g.montoEnPesos)}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(g.fecha).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  {g.contractId && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <Link to={`/contracts/${g.contractId}`} className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">
                        Ver el contrato
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
