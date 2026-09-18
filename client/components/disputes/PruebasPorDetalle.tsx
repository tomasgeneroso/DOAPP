import { useEffect, useState } from "react";
import axios from "axios";
import { CheckCircle2, Circle, AlertTriangle, CalendarDays, Image as ImageIcon } from "lucide-react";
import { getImageUrl } from "../../utils/imageUrl";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "/api";

interface Detalle {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: "pending" | "in_progress" | "completed";
  completadoEl: string | null;
  reclamado: boolean;
  reclamadoEl: string | null;
  reclamadoPor: { id: string; name: string } | null;
  notaDelReclamo: string | null;
  fotos: string[];
  fotosSubidasEl: string | null;
}

interface Dia {
  fecha: string;
  estado: "sin_marcar" | "pendiente" | "confirmado";
  adjuntos: Array<{ url: string; nombre: string; tipo: string; subidoPor: "client" | "worker"; subidoEl: string }>;
}

/**
 * Las pruebas del contrato, agrupadas como se decide una disputa: por detalle
 * obligatorio (cada tarea con sus fotos y si fue reclamada) y por dia (las
 * fotos del control diario). Las fotos sueltas de la disputa siguen abajo;
 * esto es el contexto que les da sentido.
 */
export default function PruebasPorDetalle({ disputeId, token }: { disputeId: string; token: string | null }) {
  const [data, setData] = useState<{ detalles: Detalle[]; porDia: Dia[]; resumenDiario: { confirmados: number; total: number } } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    axios
      .get(`${API_URL}/disputes/${disputeId}/pruebas`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setData(r.data.data))
      .catch(() => setError(true));
  }, [disputeId, token]);

  if (error || !data) return null;
  if (data.detalles.length === 0 && data.porDia.length === 0) return null;

  const estadoIcono = (d: Detalle) =>
    d.reclamado ? (
      <AlertTriangle className="h-4 w-4 text-red-600" aria-label="reclamado" />
    ) : d.estado === "completed" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="completado" />
    ) : (
      <Circle className="h-4 w-4 text-slate-400" aria-label={d.estado === "in_progress" ? "en curso" : "pendiente"} />
    );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pruebas por detalle del trabajo</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Cada detalle obligatorio con sus fotos y si fue reclamado. Solo estos detalles pueden fundar la disputa (T&C 10.5).
      </p>

      {data.detalles.length > 0 && (
        <ul className="mt-4 space-y-4">
          {data.detalles.map((d) => (
            <li key={d.id} className={`rounded-lg border p-4 ${d.reclamado ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-900/10" : "border-slate-200 dark:border-slate-700"}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5">{estadoIcono(d)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 dark:text-white">{d.titulo}</div>
                  {d.descripcion && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{d.descripcion}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{d.estado === "completed" ? `Completado${d.completadoEl ? ` el ${new Date(d.completadoEl).toLocaleDateString("es-AR")}` : ""}` : d.estado === "in_progress" ? "En curso" : "Pendiente"}</span>
                    {d.reclamado && (
                      <span className="text-red-700 dark:text-red-300">
                        Reclamado{d.reclamadoPor ? ` por ${d.reclamadoPor.name}` : ""}{d.reclamadoEl ? ` el ${new Date(d.reclamadoEl).toLocaleDateString("es-AR")}` : ""}
                      </span>
                    )}
                  </div>
                  {d.notaDelReclamo && <p className="mt-2 rounded-md bg-white/70 p-2 text-sm italic text-slate-700 dark:bg-black/20 dark:text-slate-200">"{d.notaDelReclamo}"</p>}
                </div>
              </div>
              {d.fotos.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {d.fotos.map((f, i) => (
                    <a key={i} href={getImageUrl(f)} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200 dark:border-slate-600">
                      <img src={getImageUrl(f)} alt={`${d.titulo} · foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-400"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> Sin fotos de este detalle.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.porDia.length > 0 && (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Control diario
            <span className="text-xs font-normal text-slate-500">({data.resumenDiario.confirmados} de {data.resumenDiario.total} días confirmados por el cliente)</span>
          </h3>
          <ul className="mt-2 space-y-3">
            {data.porDia.map((dia) => (
              <li key={dia.fecha} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {new Date(dia.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className={`text-xs ${dia.estado === "confirmado" ? "text-emerald-700" : dia.estado === "pendiente" ? "text-amber-700" : "text-slate-400"}`}>
                    {dia.estado === "confirmado" ? "confirmado por el cliente" : dia.estado === "pendiente" ? "marcado solo por el trabajador" : "sin marcar"}
                  </span>
                </div>
                {dia.adjuntos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {dia.adjuntos.map((a, i) =>
                      a.tipo.startsWith("image/") ? (
                        <a key={i} href={getImageUrl(a.url)} target="_blank" rel="noopener noreferrer" title={`${a.subidoPor === "client" ? "cliente" : "trabajador"} · ${new Date(a.subidoEl).toLocaleString("es-AR")}`} className="block aspect-square overflow-hidden rounded-md border border-slate-200 dark:border-slate-600">
                          <img src={getImageUrl(a.url)} alt={a.nombre} className="h-full w-full object-cover" loading="lazy" />
                        </a>
                      ) : (
                        <a key={i} href={getImageUrl(a.url)} target="_blank" rel="noopener noreferrer" className="flex aspect-square items-center justify-center rounded-md border border-slate-200 p-1 text-center text-[11px] text-slate-600 dark:border-slate-600 dark:text-slate-300">
                          {a.nombre}
                        </a>
                      ),
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
