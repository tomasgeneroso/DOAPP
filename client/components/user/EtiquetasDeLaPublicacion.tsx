import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Loader2 } from 'lucide-react';
import AvatarConInicial from '../ui/AvatarConInicial';
import { getImageUrl } from '@/utils/imageUrl';

/**
 * A quién se etiquetó en la publicación de un trabajo terminado, y para quien publicó, etiquetar DESPUÉS (pedido del dueño, 2026-11-23: una publicación que salió sin etiquetas
 * se puede completar). Solo se etiqueta a quien trabajó en el trabajo y permite las etiquetas en su configuración. Una publicación vieja sin trabajo vinculado deja elegir de cuál es.
 */
export interface PersonaEtiquetada {
  id: string;
  name: string;
  avatar?: string | null;
}

interface Respuesta {
  vinculado: boolean;
  trabajoId?: string;
  trabajos?: Array<{ id: string; title: string }>;
  personas: Array<PersonaEtiquetada & { permite: boolean }>;
  etiquetados: string[];
}

export default function EtiquetasDeLaPublicacion({
  postId,
  etiquetados,
  esAutor,
  token,
  alCambiar,
}: {
  postId: string;
  etiquetados?: PersonaEtiquetada[];
  esAutor: boolean;
  token?: string | null;
  alCambiar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [trabajo, setTrabajo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = async (jobId?: string) => {
    setCargando(true);
    setMensaje(null);
    try {
      const r = await fetch(`/api/posts/${postId}/etiquetables${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || 'No se pudo ver a quién etiquetar.');
      setDatos(j as Respuesta);
      setElegidos((j.etiquetados || []).map(String));
    } catch (e: any) {
      setMensaje(e?.message || 'No se pudo ver a quién etiquetar.');
    } finally {
      setCargando(false);
    }
  };

  const abrir = () => {
    setAbierto(true);
    void cargar();
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await fetch(`/api/posts/${postId}/etiquetas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taggedUsers: elegidos, ...(trabajo ? { linkedJob: trabajo } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || 'No se pudo guardar.');
      setAbierto(false);
      alCambiar();
    } catch (e: any) {
      setMensaje(e?.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const hayEtiquetas = !!etiquetados && etiquetados.length > 0;
  if (!hayEtiquetas && !esAutor) return null;

  return (
    <div className="mb-6" data-testid="etiquetas-de-la-publicacion">
      {hayEtiquetas && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Con:</span>
          {etiquetados!.map((p) => (
            <Link key={p.id} to={`/profile/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600" data-testid="persona-etiquetada">
              <AvatarConInicial src={p.avatar ? getImageUrl(p.avatar) : null} nombre={p.name} className="h-6 w-6 rounded-full text-xs" />
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {esAutor && !abierto && (
        <button type="button" onClick={abrir} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300" data-testid="etiquetar-participantes">
          <Tag className="h-4 w-4" aria-hidden="true" />
          {hayEtiquetas ? 'Cambiar las etiquetas' : 'Etiquetar a los participantes'}
        </button>
      )}

      {esAutor && abierto && (
        <div className="mt-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" data-testid="panel-de-etiquetas">
          {cargando && <Loader2 className="h-5 w-5 animate-spin text-sky-500" aria-label="Cargando" />}
          {!cargando && datos && !datos.vinculado && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">Esta publicación no quedó unida a un trabajo. Elegí de cuál es para poder etiquetar a quienes trabajaron.</p>
              {datos.trabajos && datos.trabajos.length > 0 ? (
                <select
                  value={trabajo}
                  onChange={(e) => {
                    setTrabajo(e.target.value);
                    if (e.target.value) void cargar(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  data-testid="elegir-trabajo-de-la-publicacion"
                >
                  <option value="">Elegí el trabajo</option>
                  {datos.trabajos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-slate-500">No encontramos trabajos terminados tuyos para unir.</p>
              )}
            </div>
          )}
          {!cargando && datos && datos.vinculado && (
            <div className="space-y-2">
              {datos.personas.length === 0 && <p className="text-sm text-slate-500">No hay otras personas que hayan trabajado en este trabajo.</p>}
              {datos.personas.map((p) => {
                const yaEstaba = (datos.etiquetados || []).map(String).includes(p.id);
                const bloqueada = !p.permite && !yaEstaba;
                const marcada = elegidos.includes(p.id);
                return (
                  <label key={p.id} className={`flex items-center gap-3 rounded-lg border p-2 ${bloqueada ? 'opacity-60' : 'cursor-pointer'} ${marcada ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={bloqueada}
                      onChange={() => setElegidos((prev) => (marcada ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      data-testid="etiquetar-a-esta-persona"
                    />
                    <AvatarConInicial src={p.avatar ? getImageUrl(p.avatar) : null} nombre={p.name} className="h-8 w-8 shrink-0 rounded-full" />
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</span>
                    {bloqueada && <span className="ml-auto text-xs text-slate-500">No permite etiquetas</span>}
                  </label>
                );
              })}
            </div>
          )}
          {mensaje && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{mensaje}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || cargando || !datos || (!datos.vinculado && !trabajo)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              data-testid="guardar-etiquetas"
            >
              {guardando ? 'Guardando…' : 'Guardar etiquetas'}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
