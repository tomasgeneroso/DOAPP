import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckCircle, Loader2, Send, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getImageUrl } from '@/utils/imageUrl';
import AvatarConInicial from '@/components/ui/AvatarConInicial';
import { mensajeParaCompartir, type QueSeComparte } from '../../../shared/chat/enlacesDeDoapp';

/**
 * Enviar una publicación o un artículo por el chat interno (pedido del dueño, 2026-11-27). Se elige una conversación o se busca a una persona; el mensaje
 * lleva el enlace de DOAPP, que en el chat se ve como una tarjeta que abre dentro de la app.
 */
interface Persona { id: string; name: string; avatar?: string | null; username?: string }

export default function CompartirPorChat({ que, ruta, titulo, className = '', conTexto = false }: { que: QueSeComparte; ruta: string; titulo: string; className?: string; conTexto?: boolean }) {
  const { user, token } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [buscado, setBuscado] = useState('');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviandoA, setEnviandoA] = useState('');
  const [enviado, setEnviado] = useState<{ nombre: string; conversacion: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const yo = String((user as { id?: string } | null)?.id ?? '');
  const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // Sin buscar nada se ofrecen las personas con las que ya hay conversación; escribiendo, se busca a cualquiera.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const t = window.setTimeout(async () => {
      setCargando(true);
      try {
        const q = buscado.trim();
        const r = await fetch(q.length >= 2 ? `/api/users/search?q=${encodeURIComponent(q)}&limit=10` : '/api/chat/conversations', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json().catch(() => null);
        const lista: Persona[] = q.length >= 2
          ? (d?.users || [])
          : (d?.conversations || d?.data || []).flatMap((c: { type?: string; participants?: Persona[] }) => (c.type === 'group' || (c.participants?.length ?? 0) > 2 ? [] : c.participants || []));
        const unicas = new Map(lista.filter((p) => p?.id && String(p.id) !== yo).map((p) => [String(p.id), p]));
        if (vigente) setPersonas([...unicas.values()].slice(0, 20));
      } catch {
        if (vigente) setPersonas([]);
      } finally {
        if (vigente) setCargando(false);
      }
    }, buscado ? 300 : 0);
    return () => { vigente = false; window.clearTimeout(t); };
  }, [abierto, buscado, token, yo]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  if (!user) return null;

  const enviar = async (p: Persona) => {
    setEnviandoA(String(p.id));
    setAviso('');
    try {
      const c = await fetch('/api/chat/conversations', { method: 'POST', headers: cabeceras, credentials: 'include', body: JSON.stringify({ participantId: p.id }) }).then((r) => r.json());
      const conversacion = c?.conversation?.id;
      if (!c?.success || !conversacion) throw new Error(c?.message || 'No se pudo abrir la conversación.');
      const m = await fetch(`/api/chat/conversations/${conversacion}/messages`, { method: 'POST', headers: cabeceras, credentials: 'include', body: JSON.stringify({ content: mensajeParaCompartir(que, titulo, `${window.location.origin}${ruta}`) }) }).then((r) => r.json());
      if (!m?.success) throw new Error(m?.message || 'No se pudo enviar.');
      setEnviado({ nombre: p.name, conversacion: String(conversacion) });
    } catch (e) {
      setAviso((e as Error).message || 'No se pudo enviar.');
    } finally {
      setEnviandoA('');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEnviado(null); setAviso(''); setBuscado(''); setAbierto(true); }}
        data-testid="enviar-por-chat"
        title="Enviar por chat"
        aria-label="Enviar por chat"
        className={`inline-flex items-center gap-2 rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-700 ${className}`}
      >
        <Send className="h-5 w-5" aria-hidden="true" />
        {conTexto && <span className="text-sm font-medium">Enviar por chat</span>}
      </button>
      {abierto && createPortal(
        <div className="animate-fadeIn fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Enviar por chat" data-testid="modal-enviar-por-chat" onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Enviar por chat</h3>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{titulo}</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            {enviado ? (
              <div className="space-y-3 p-6 text-center" role="status">
                <CheckCircle className="mx-auto h-10 w-10 text-green-500" aria-hidden="true" />
                <p className="text-slate-800 dark:text-slate-100">Enviado a {enviado.nombre}.</p>
                <Link to={`/messages/${enviado.conversacion}`} onClick={() => setAbierto(false)} className="inline-block font-semibold text-sky-700 hover:underline dark:text-sky-300">Ver la conversación →</Link>
              </div>
            ) : (
              <>
                <div className="p-4 pb-2">
                  <input value={buscado} onChange={(e) => setBuscado(e.target.value)} placeholder="Buscar por nombre o @usuario" aria-label="Buscar a quién enviarlo" autoFocus className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
                </div>
                {aviso && <p role="alert" className="mx-4 mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{aviso}</p>}
                <div className="min-h-[8rem] flex-1 overflow-y-auto">
                  {cargando ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sky-500" aria-label="Cargando" /></div>
                  ) : personas.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{buscado.trim().length >= 2 ? 'Sin resultados para esa búsqueda.' : 'Escribí al menos 2 letras para buscar a alguien.'}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                      {personas.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => { void enviar(p); }} disabled={!!enviandoA} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-700">
                            <AvatarConInicial src={p.avatar ? getImageUrl(p.avatar) : null} nombre={p.name} className="h-10 w-10 shrink-0 rounded-full" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-slate-900 dark:text-white">{p.name}</span>
                              {p.username && <span className="block text-sm text-slate-500 dark:text-slate-400">@{p.username}</span>}
                            </span>
                            {enviandoA === String(p.id) ? <Loader2 className="h-5 w-5 animate-spin text-sky-500" /> : <Send className="h-5 w-5 text-sky-500" aria-hidden="true" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
