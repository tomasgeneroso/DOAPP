import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, PauseCircle, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { LARGO_MAXIMO_DEL_RELATO, LARGO_MINIMO_DEL_RELATO, OPCIONES_DE_PROBLEMA, TEXTO_DEL_PROBLEMA, tituloDeProblema } from '../../../shared/tickets/problemasDelTrabajo';

/**
 * «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21): lo ve quien contrató mientras el trabajo está en marcha o esperando confirmación. Cuenta qué pasó y se abre un
 * TICKET para el equipo de DOAPP: la confirmación automática se detiene y el pago no se libera. Desde el ticket se lleva a un reclamo o, si se arregla, se sigue con el mismo trabajo
 * y quien contrató puede aceptar el fin del trabajo de nuevo.
 */
export interface ProblemaAbierto {
  ticketId: string | null;
  ticketNumber: string | null;
  categoria?: string;
  esMio?: boolean;
}

export default function HuboProblemas({ contractId, problema = null, className = '' }: { contractId: string; problema?: ProblemaAbierto | boolean | null; className?: string }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ya hay un aviso abierto: no se ofrece otro, se muestra cuál es.
  if (problema) {
    const p = typeof problema === 'object' ? problema : null;
    return (
      <div className={`flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100 ${className}`} data-testid="problema-ya-avisado">
        <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Ya avisaste que hubo problemas{p?.ticketNumber ? ` (${p.ticketNumber})` : ''}. El pago no se libera hasta que se resuelva.{' '}
          {p?.ticketId && <Link to={`/tickets/${p.ticketId}`} className="font-semibold underline">Ver el ticket</Link>}
        </span>
      </div>
    );
  }

  const cerrar = () => { if (!enviando) setAbierto(false); };
  const relato = detalle.trim();
  const puedeEnviar = !!categoria && relato.length >= LARGO_MINIMO_DEL_RELATO && !enviando;

  const enviar = async () => {
    if (!puedeEnviar || !categoria) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/hubo-problemas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categoria, detalle: relato }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.ticket?.id) {
        navigate(`/tickets/${data.ticket.id}`);
        return;
      }
      // Ya había uno abierto: se lleva a ese.
      if (data?.code === 'PROBLEMA_YA_ABIERTO' && data.ticketId) {
        navigate(`/tickets/${data.ticketId}`);
        return;
      }
      setError(data?.message || 'No pudimos enviar el aviso. Probá de nuevo.');
    } catch {
      setError('No pudimos enviar el aviso. Revisá tu conexión y probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setCategoria(null); setDetalle(''); setError(null); setAbierto(true); }}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20 ${className}`}
        data-testid="hubo-problemas"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Hubo problemas durante el trabajo
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={cerrar} data-testid="hubo-problemas-dialogo">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">¿Qué pasó?</h3>
              <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Contanos qué pasó y abrimos un <strong>ticket</strong> para el equipo de DOAPP. <strong>La confirmación automática se detiene</strong> y el pago queda en custodia. Después podés llevarlo a un reclamo o, si se arregla, seguir con el mismo trabajo.
            </p>
            <div className="space-y-2" role="radiogroup" aria-label="Qué pasó">
              {OPCIONES_DE_PROBLEMA.map((o) => (
                <label key={o.categoria} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${categoria === o.categoria ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="radio" name="que-paso" value={o.categoria} checked={categoria === o.categoria} onChange={() => setCategoria(o.categoria)} className="mt-1" data-testid={`problema-${o.categoria}`} />
                  <span className="text-sm">
                    <span className="block font-medium text-slate-900 dark:text-white">{o.titulo}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{o.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-900 dark:text-white" htmlFor="relato-del-problema">
              Contá qué pasó{categoria ? ` (${tituloDeProblema(categoria).toLowerCase()})` : ''}
            </label>
            <textarea
              id="relato-del-problema"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.slice(0, LARGO_MAXIMO_DEL_RELATO))}
              rows={4}
              placeholder="Por ejemplo: se fue sin terminar el piso de la cocina y no volvió."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              data-testid="relato-del-problema"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {relato.length < LARGO_MINIMO_DEL_RELATO ? `Escribí al menos ${LARGO_MINIMO_DEL_RELATO} letras para que el equipo pueda ayudar.` : `${relato.length}/${LARGO_MAXIMO_DEL_RELATO}`}
            </p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300" data-testid="hubo-problemas-error">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={cerrar} className="flex-1 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white">Cancelar</button>
              <button
                type="button"
                disabled={!puedeEnviar}
                onClick={enviar}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="hubo-problemas-continuar"
              >
                {enviando ? 'Enviando…' : 'Enviar aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Lo que ve el TRABAJADOR (y quien contrató) cuando hay un aviso abierto: el pago no se libera solo hasta que el equipo lo resuelva. */
export function AvisoDeProblemaAbierto({ problema, soyQuienContrato, className = '' }: { problema?: ProblemaAbierto | null; soyQuienContrato: boolean; className?: string }) {
  if (!problema) return null;
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100 ${className}`} data-testid="aviso-de-problema-abierto">
      <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{soyQuienContrato ? 'Avisaste que hubo problemas' : 'Quien te contrató avisó que hubo problemas'}{problema.ticketNumber ? ` (${problema.ticketNumber})` : ''}</p>
        <p className="text-xs">
          {TEXTO_DEL_PROBLEMA.pausa} {soyQuienContrato ? 'Si se arregla, podés seguir con el mismo trabajo; si no, llevarlo a un reclamo.' : 'El equipo de DOAPP lo revisa y te avisamos cómo sigue.'}
          {soyQuienContrato && problema.ticketId && (
            <>{' '}<Link to={`/tickets/${problema.ticketId}`} className="font-semibold underline">Ver el ticket</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
