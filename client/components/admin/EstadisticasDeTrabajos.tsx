import { useCallback, useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { useCambiosDeAdministracion } from "../../hooks/useSocket";
import type { GrupoDeEstadisticas, TonoDeFila } from "../../../shared/admin/estadisticasDeTrabajos";

/**
 * Estadísticas de trabajos, solo para el dueño (pedido del dueño, 2026-11-13): cuántos trabajos hay realizados, sin terminar, sin pagar, sin publicar,
 * publicados y sin comenzar, pausados y sin reanudar…, y cómo van los contratos y los pagos a trabajadores. Se actualiza solo (en vivo, como todo el panel).
 * Para quien no es el dueño la ruta responde 403 y esta tarjeta no se dibuja.
 */
const COLOR: Record<TonoDeFila, string> = {
  atender: "text-red-600 dark:text-red-400",
  espera: "text-amber-600 dark:text-amber-400",
  marcha: "text-sky-600 dark:text-sky-400",
  fin: "text-emerald-600 dark:text-emerald-400",
  cancelada: "text-slate-500 dark:text-slate-400",
};

interface Datos {
  total: number;
  generadoEl: string;
  grupos: GrupoDeEstadisticas[];
}

export default function EstadisticasDeTrabajos() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/analytics/trabajos", { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setDatos(null);
        return; // no es el dueño: no se muestra
      }
      const json = await res.json();
      if (json.success) {
        setDatos(json.data);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // En vivo: cualquier cambio de trabajos, contratos o pagos recalcula las cantidades.
  useCambiosDeAdministracion(["job", "contract", "payment"], () => { void cargar(); }, 5000);

  if (!datos) {
    return error ? <p className="text-sm text-red-600" role="alert">No se pudieron cargar las estadísticas de trabajos.</p> : null;
  }

  return (
    <section data-testid="estadisticas-de-trabajos" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-sky-600" />
          Trabajos por situación
        </h2>
        <p className="text-xs text-gray-500">Solo para el dueño · {datos.total.toLocaleString("es-AR")} publicaciones en total</p>
      </div>

      {datos.grupos.map((g) => (
        <div key={g.titulo} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">{g.titulo}</h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {g.filas.map((f) => (
              <li key={f.clave} className={`flex items-center justify-between gap-4 px-4 py-2.5 ${f.detalleDe ? "pl-9 bg-slate-50/60 dark:bg-slate-900/20" : ""}`} data-testid={`estadistica-${f.clave}`}>
                <div className="min-w-0">
                  <p className={`text-sm ${f.detalleDe ? "text-slate-600 dark:text-slate-300" : "font-medium text-slate-900 dark:text-white"}`}>{f.rotulo}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{f.explicacion}</p>
                </div>
                <span className={`text-xl font-bold tabular-nums ${COLOR[f.tono]}`}>{f.cantidad.toLocaleString("es-AR")}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
