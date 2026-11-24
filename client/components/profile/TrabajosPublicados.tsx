import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ExternalLink, Loader2, MapPin } from "lucide-react";
import { estadoDePublicacion } from "../../../shared/jobs/estadoDePublicacion";
import Transicion from "../ui/Transicion";

interface TrabajoPublicado {
  id: string;
  title: string;
  price?: number | string;
  status: string;
  location?: string;
  category?: string;
  createdAt?: string;
}

const TONOS: Record<string, string> = {
  bien: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  espera: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  atencion: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  cierre: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
};

/**
 * Los trabajos que una persona PUBLICÓ como cliente (pestaña «Trabajos» del perfil).
 *
 * En el perfil propio salen todos con su estado y qué sigue (sin pagar, en revisión, en el muro…); en el perfil de otra persona, solo lo
 * que es público (los trabajos publicados en el muro).
 */
export default function TrabajosPublicados({ userId, esPropio, token }: { userId: string; esPropio: boolean; token?: string | null }) {
  const clave = `${userId}|${esPropio}`;
  const [respuesta, setRespuesta] = useState<{ clave: string; trabajos: TrabajoPublicado[] | null; fallo: boolean } | null>(null);
  // Mientras la respuesta guardada sea de otra persona (o no haya ninguna), se está cargando.
  const trabajos = respuesta?.clave === clave ? respuesta.trabajos : null;
  const fallo = respuesta?.clave === clave && respuesta.fallo;

  useEffect(() => {
    let vivo = true;
    const url = esPropio ? "/api/jobs/my-jobs" : `/api/jobs?client=${encodeURIComponent(userId)}&limit=50`;
    fetch(url, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const lista = d?.jobs ?? d?.data;
        if (!d?.success || !Array.isArray(lista)) {
          setRespuesta({ clave, trabajos: null, fallo: true });
          return;
        }
        setRespuesta({ clave, trabajos: lista as TrabajoPublicado[], fallo: false });
      })
      .catch(() => {
        if (vivo) setRespuesta({ clave, trabajos: null, fallo: true });
      });
    return () => {
      vivo = false;
    };
  }, [userId, esPropio, token]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Trabajos publicados</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {trabajos === null ? " " : `${trabajos.length} ${trabajos.length === 1 ? "trabajo publicado" : "trabajos publicados"}`}
          </p>
        </div>
        {esPropio && (
          <Link to="/my-jobs" className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">
            Administrar en Mis trabajos →
          </Link>
        )}
      </div>

      <div className="p-6">
        {trabajos === null && !fallo ? (
          <div className="text-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500 mx-auto" aria-label="Cargando" />
          </div>
        ) : fallo ? (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400 py-8">No pudimos cargar los trabajos publicados. Probá de nuevo en un momento.</p>
        ) : trabajos && trabajos.length === 0 ? (
          <div className="text-center py-10">
            <Briefcase className="w-14 h-14 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="font-semibold text-slate-900 dark:text-white">{esPropio ? "Todavía no publicaste ningún trabajo" : "Todavía no publicó trabajos"}</p>
            {esPropio && (
              <Link to="/contracts/create" className="mt-3 inline-block text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">
                Publicar un trabajo →
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {(trabajos ?? []).map((j) => {
              const estado = estadoDePublicacion({ id: j.id, status: j.status });
              return (
                <li key={j.id} className="animate-fadeIn">
                  <Link
                    to={`/jobs/${j.id}`}
                    className="block rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{j.title}</p>
                      {esPropio && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONOS[estado.tono] ?? TONOS.info}`}>{estado.etiqueta}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                      {j.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {j.location}
                        </span>
                      )}
                      {j.price !== undefined && Number(j.price) > 0 && <span className="font-semibold text-green-600 dark:text-green-400">${Number(j.price).toLocaleString("es-AR")}</span>}
                      <span className="ml-auto inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        Ver trabajo <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </div>
                    {esPropio && (
                      <Transicion mostrar={!!estado.explicacion}>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{estado.explicacion}</p>
                      </Transicion>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
