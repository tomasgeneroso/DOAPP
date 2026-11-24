import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, ExternalLink, Loader2, MapPin, Share2, Trash2 } from "lucide-react";
import { estadoDePublicacion } from "../../../shared/jobs/estadoDePublicacion";
import Transicion from "../ui/Transicion";
import ConfirmModal from "../ui/ConfirmModal";

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
  const navigate = useNavigate();
  // Qué trabajos míos están en el muro del perfil: { trabajo: publicación }. Solo en el perfil propio.
  const [enElMuro, setEnElMuro] = useState<Record<string, string>>({});
  const [aQuitar, setAQuitar] = useState<{ trabajoId: string; postId: string; titulo: string } | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [errorAlQuitar, setErrorAlQuitar] = useState<string | null>(null);
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

  useEffect(() => {
    if (!esPropio || !token) return;
    let vivo = true;
    fetch("/api/posts/mis-trabajos-en-el-muro", { credentials: "include", headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.success && d.enElMuro) setEnElMuro(d.enElMuro as Record<string, string>);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [esPropio, token]);

  /** Quita la publicación del muro. El trabajo NO se toca (editarlo o borrarlo desde acá sería modificar el trabajo). */
  const quitarDelMuro = async () => {
    if (!aQuitar) return;
    setQuitando(true);
    setErrorAlQuitar(null);
    try {
      const r = await fetch(`/api/posts/${aQuitar.postId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || "No se pudo quitar del muro.");
      setEnElMuro((prev) => {
        const { [aQuitar.trabajoId]: _quitado, ...resto } = prev;
        return resto;
      });
      setAQuitar(null);
    } catch (e: any) {
      setErrorAlQuitar(e?.message || "No se pudo quitar del muro.");
    } finally {
      setQuitando(false);
    }
  };

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
                  {/* Muro del perfil: solo agregar o quitar la publicación del trabajo; el trabajo no se modifica. */}
                  {esPropio && (enElMuro[j.id] || j.status === "completed") && (
                    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="acciones-del-muro">
                      {enElMuro[j.id] ? (
                        <button
                          type="button"
                          onClick={() => { setErrorAlQuitar(null); setAQuitar({ trabajoId: j.id, postId: enElMuro[j.id], titulo: j.title }); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                          data-testid="quitar-del-muro"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Quitar del muro del perfil
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/portfolio/create?fromJob=${j.id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-900/50 dark:text-sky-400 dark:hover:bg-sky-900/20"
                          data-testid="agregar-al-muro"
                        >
                          <Share2 className="h-4 w-4" aria-hidden="true" /> Agregar al muro del perfil
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmModal
        open={!!aQuitar}
        tone="danger"
        loading={quitando}
        title="Quitar del muro del perfil"
        confirmLabel="Quitar"
        message={
          <>
            <p>¿Querés quitar <strong>{aQuitar?.titulo}</strong> de tu muro? El trabajo no se modifica y lo podés volver a agregar cuando quieras.</p>
            {errorAlQuitar && <p role="alert" className="mt-2 text-red-400">{errorAlQuitar}</p>}
          </>
        }
        onConfirm={quitarDelMuro}
        onClose={() => setAQuitar(null)}
      />
    </div>
  );
}
