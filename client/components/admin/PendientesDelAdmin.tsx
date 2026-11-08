import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import { useCambiosDeAdministracion } from "@/hooks/useSocket";
import Transicion from "@/components/ui/Transicion";
import {
  ETIQUETAS_DE_CATEGORIA,
  ETIQUETAS_DE_URGENCIA,
  type CategoriaDePendiente,
  type TareaPendiente,
  type Urgencia,
} from "../../../shared/admin/pendientes";

/**
 * Lo primero que ve el administrador: qué tiene que hacer, de lo más urgente a lo menos y por tipo (retiros, publicaciones, disputas…).
 *
 * Lo que va en cada nivel lo decide `shared/admin/pendientes.ts` (cuánto lleva esperando lo más viejo); acá solo se muestra. Si una fuente no se pudo
 * leer se dice, en vez de mostrar «todo al día» sobre algo que no se miró.
 */

interface Respuesta {
  success: boolean;
  tareas?: TareaPendiente[];
  fallos?: string[];
}

const ESTILO: Record<Urgencia, { caja: string; icono: JSX.Element; chip: string }> = {
  urgente: {
    caja: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
    icono: <AlertOctagon className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />,
    chip: "bg-red-600 text-white",
  },
  importante: {
    caja: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
    icono: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />,
    chip: "bg-amber-500 text-white",
  },
  normal: {
    caja: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800",
    icono: <Clock className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden />,
    chip: "bg-slate-500 text-white",
  },
};

const NIVELES: Urgencia[] = ["urgente", "importante", "normal"];

export default function PendientesDelAdmin() {
  const [tareas, setTareas] = useState<TareaPendiente[] | null>(null);
  const [fallos, setFallos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaDePendiente | "todas">("todas");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/hubs/pendientes", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const datos: Respuesta = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !datos.success) throw new Error("No se pudieron leer los pendientes.");
      setTareas(datos.tareas ?? []);
      setFallos(datos.fallos ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los pendientes.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    // Además de los avisos en vivo, cada minuto: la espera de lo más viejo cambia el nivel aunque nada se mueva.
    const cada = window.setInterval(() => void cargar(), 60_000);
    return () => window.clearInterval(cada);
  }, [cargar]);

  // Dinero, publicaciones, contratos y reclamos avisan al panel; el resto (identidad) se ve en la recarga del minuto.
  useCambiosDeAdministracion(["withdrawal", "payment", "job", "contract", "dispute", "ticket"], () => void cargar());

  const categorias = useMemo(() => {
    const cuenta = new Map<CategoriaDePendiente, number>();
    for (const t of tareas ?? []) cuenta.set(t.categoria, (cuenta.get(t.categoria) ?? 0) + 1);
    return [...cuenta.entries()];
  }, [tareas]);

  const visibles = (tareas ?? []).filter((t) => categoria === "todas" || t.categoria === categoria);
  const porNivel = (n: Urgencia) => visibles.filter((t) => t.urgencia === n);
  const resumen = NIVELES.map((n) => ({ n, cantidad: (tareas ?? []).filter((t) => t.urgencia === n).length })).filter((x) => x.cantidad > 0);

  return (
    <section aria-labelledby="pendientes-titulo" className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pendientes-titulo" className="text-xl font-bold text-gray-900 dark:text-white">
            Lo que tenés que hacer
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">De lo más urgente a lo menos, según cuánto lleva esperando lo más viejo.</p>
        </div>
        <div className="flex items-center gap-2">
          {resumen.map(({ n, cantidad }) => (
            <span key={n} className={`rounded-full px-3 py-1 text-xs font-bold ${ESTILO[n].chip}`}>
              {cantidad} {cantidad === 1 ? ETIQUETAS_DE_URGENCIA[n].toLowerCase() : n === "urgente" ? "urgentes" : n === "importante" ? "importantes" : "normales"}
            </span>
          ))}
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            aria-label="Actualizar pendientes"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Transicion mostrar={!!error}>
        {error && (
          <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error} Lo que ves abajo puede estar desactualizado.
          </p>
        )}
      </Transicion>

      <Transicion mostrar={fallos.length > 0}>
        {fallos.length > 0 && (
          <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <strong>No se pudo leer:</strong> {fallos.join("; ")}. Que no aparezca no quiere decir que no haya trabajo ahí.
          </p>
        )}
      </Transicion>

      {tareas === null && !error ? (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando pendientes…
        </div>
      ) : tareas !== null && tareas.length === 0 && fallos.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
          <CheckCircle2 className="h-6 w-6 flex-shrink-0" aria-hidden />
          <p className="font-semibold">Todo al día: no hay nada esperándote.</p>
        </div>
      ) : (
        <>
          {categorias.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
              {[["todas", `Todas (${tareas?.length ?? 0})`] as const, ...categorias.map(([c, n]) => [c, `${ETIQUETAS_DE_CATEGORIA[c]} (${n})`] as const)].map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setCategoria(clave as CategoriaDePendiente | "todas")}
                  aria-pressed={categoria === clave}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    categoria === clave
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-5">
            {NIVELES.map((nivel) => {
              const filas = porNivel(nivel);
              if (filas.length === 0) return null;
              return (
                <div key={nivel}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                    {ESTILO[nivel].icono}
                    {ETIQUETAS_DE_URGENCIA[nivel]}
                  </h3>
                  <ul className="space-y-2">
                    {filas.map((t) => (
                      <li key={t.clave}>
                        <Link
                          to={t.ruta}
                          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition-shadow hover:shadow-md ${ESTILO[nivel].caja}`}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white">{t.titulo}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t.detalle}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {ETIQUETAS_DE_CATEGORIA[t.categoria]}
                            </span>
                            <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">Resolver →</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
