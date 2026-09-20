import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface Hallazgo {
  invariante: 1 | 2 | 3 | 4 | 5;
  gravedad: "alta" | "media";
  titulo: string;
  detalle: string;
  monto?: number;
  userId?: string;
  jobId?: string;
  contractId?: string;
}
interface Resultado { corridaEl: string; usuariosRevisados: number; hallazgos: Hallazgo[]; resumen: Record<string, number> }

const INVARIANTES: Record<number, string> = {
  1: "El saldo de cada usuario es la suma de sus asientos",
  2: "Ninguna devolución queda pendiente para siempre",
  3: "Ninguna publicación cancelada deja la plata trabada",
  4: "Ningún contrato se paga dos veces ni se paga y devuelve a la vez",
  5: "Ningún retiro pendiente supera el saldo",
};

/**
 * Los invariantes del dinero, con cada lugar donde no cierran. No arregla
 * nada: es lo primero que se mira cuando alguien dice "me falta plata" y lo
 * último antes de un deploy que toque dinero.
 */
export default function AuditoriaSaldos() {
  const { token } = useAuth();
  const [r, setR] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correr = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/hubs/auditoria-saldos`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "No se pudo correr");
      setR(d.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void correr(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Auditoría de saldos</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Cinco cosas que tienen que ser verdad siempre. Si alguna no lo es, acá aparece con el número y quién. No arregla nada solo.
          </p>
        </div>
        <button onClick={correr} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Correr de nuevo
        </button>
      </header>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((n) => {
          const cant = r?.resumen?.[`inv${n}`] || 0;
          return (
            <li key={n} className={`rounded-lg border p-3 text-xs ${cant ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"}`}>
              <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-100">
                {cant ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />}
                Invariante {n}
                {cant ? <span className="ml-auto rounded bg-red-600 px-1.5 text-white">{cant}</span> : null}
              </div>
              <div className="mt-1 text-slate-600 dark:text-slate-300">{INVARIANTES[n]}</div>
            </li>
          );
        })}
      </ol>

      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

      {r && (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {r.hallazgos.length === 0 ? "Todo cierra" : `${r.hallazgos.length} ${r.hallazgos.length === 1 ? "hallazgo" : "hallazgos"}`}
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {r.usuariosRevisados} usuarios con saldo o movimientos · corrida {new Date(r.corridaEl).toLocaleString("es-AR")}
            </span>
          </div>
          {r.hallazgos.length === 0 ? (
            <p className="p-8 text-center text-sm text-emerald-700 dark:text-emerald-300">Saldo y libro coinciden para todos; no hay plata trabada ni pagos dobles.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {r.hallazgos.map((h, i) => (
                <li key={i} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${h.gravedad === "alta" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>
                    inv {h.invariante}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{h.titulo}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">{h.detalle}</div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {h.userId && <Link to={`/admin/historial/${h.userId}`} className="text-sky-600 hover:underline dark:text-sky-400">historial del usuario</Link>}
                      {h.jobId && <Link to={`/admin/jobs?id=${h.jobId}`} className="text-sky-600 hover:underline dark:text-sky-400">publicación</Link>}
                      {h.contractId && <Link to={`/admin/contracts/${h.contractId}`} className="text-sky-600 hover:underline dark:text-sky-400">contrato</Link>}
                    </div>
                  </div>
                  {typeof h.monto === "number" && (
                    <div className="text-right font-mono text-sm tabular-nums text-slate-800 dark:text-slate-100">
                      {h.monto > 0 ? "+" : ""}${Math.round(h.monto).toLocaleString("es-AR")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
