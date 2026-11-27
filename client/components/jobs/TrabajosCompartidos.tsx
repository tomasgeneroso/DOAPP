import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ExternalLink, Share2 } from 'lucide-react';
import { useEventoEnVivo } from '@/hooks/useSocket';
import Pestanas from '@/components/ui/Pestanas';
import InfoIcono from '@/components/ui/InfoIcono';

/**
 * Compartir un trabajo terminado (pedido del dueño, 2026-11-27): antes de OFRECER algo se verifica que no exista; si ya existe, se lleva a lo que existe.
 * `compartidos` = `{ idDelTrabajo: idDeMiPublicacion }`; `undefined` mientras se está verificando (ahí no se ofrece nada todavía).
 */
export function useTrabajosCompartidos(token: string | null | undefined): Record<string, string> | undefined {
  const [compartidos, setCompartidos] = useState<Record<string, string> | undefined>(undefined);
  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/posts/mis-compartidos', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      // Si no se pudo verificar se ofrece igual: el servidor no deja compartir dos veces y contesta dónde está.
      setCompartidos(d?.success && d.compartidos ? d.compartidos : {});
    } catch {
      setCompartidos({});
    }
  }, [token]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEventoEnVivo(['socket:reconectado'], () => { void cargar(); });
  return compartidos;
}

export function OfertaDeCompartir({ jobId, compartidos, className = '' }: { jobId: string; compartidos: Record<string, string> | undefined; className?: string }) {
  if (!compartidos) return null;
  const publicacion = compartidos[jobId];
  if (publicacion) {
    return (
      <div className={`animate-fadeIn flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`} data-testid="trabajo-ya-compartido">
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
          Ya habías compartido este trabajo
        </span>
        <Link to={`/posts/${publicacion}`} className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline dark:text-sky-300">
          Ver trabajo compartido <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }
  return (
    <Link
      to={`/portfolio/create?fromJob=${jobId}`}
      data-testid="compartir-trabajo"
      className={`animate-fadeIn inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300 ${className}`}
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      Compartir en mi perfil
    </Link>
  );
}

export interface TrabajoRealizado {
  id: string;
  titulo: string;
  como: 'trabajaste' | 'contrataste';
}

/** «Mis trabajos» → Realizados: los terminados en que participaste, separados en los que todavía no compartiste y los que ya están en tu perfil. */
export function TrabajosRealizados({ trabajos, compartidos, inicial = 'no' }: { trabajos: TrabajoRealizado[]; compartidos: Record<string, string> | undefined; inicial?: 'no' | 'si' }) {
  const [vista, setVista] = useState<'no' | 'si'>(inicial);
  if (!compartidos) return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400" role="status">Revisando qué compartiste…</p>;
  const publicados = trabajos.filter((t) => compartidos[t.id]);
  const sinPublicar = trabajos.filter((t) => !compartidos[t.id]);
  const lista = vista === 'si' ? publicados : sinPublicar;
  return (
    <div className="space-y-4" data-testid="trabajos-realizados">
      <div className="flex items-center gap-2">
        <Pestanas
          className="flex-1"
          ariaLabel="Trabajos realizados"
          testid="pestanas-de-realizados"
          valor={vista}
          onCambiar={setVista}
          opciones={[
            { id: 'no' as const, texto: 'No publicados', insignia: sinPublicar.length },
            { id: 'si' as const, texto: 'Publicados', insignia: publicados.length },
          ]}
        />
        <InfoIcono ayuda="Trabajos realizados" />
      </div>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {trabajos.length === 0 ? 'Tus trabajos terminados van a aparecer acá.' : vista === 'si' ? 'Los trabajos que compartas en tu perfil van a aparecer acá.' : 'Ya compartiste todos tus trabajos terminados.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {lista.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="min-w-0">
                <Link to={`/jobs/${t.id}`} className="font-semibold text-slate-900 hover:text-sky-600 dark:text-white dark:hover:text-sky-400">{t.titulo}</Link>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.como === 'trabajaste' ? 'Trabajaste en este trabajo' : 'Contrataste este trabajo'}</p>
              </div>
              <OfertaDeCompartir jobId={t.id} compartidos={compartidos} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
