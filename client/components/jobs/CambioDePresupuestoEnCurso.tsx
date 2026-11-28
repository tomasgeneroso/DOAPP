import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Loader2 } from 'lucide-react';
import Transicion from '../ui/Transicion';
import { useEventoEnVivo } from '../../hooks/useSocket';

/**
 * El cambio de presupuesto en curso (pedido del dueño, 2026-11-27: con alguien elegido se aplica recién cuando acepta). Se ve en el trabajo y en el contrato:
 * quien publicó ve quién falta y puede retirarlo (o pagar la diferencia); la persona elegida ve su parte y tiene los botones para aceptar o rechazar.
 * Se vuelve a leer en vivo y no se dibuja nada si no hay un pedido.
 */
interface Solicitud {
  soy: 'cliente' | 'elegido';
  estado: 'esperando_respuesta' | 'esperando_pago';
  precioAnterior: number;
  precioNuevo: number;
  motivo: string;
  elegidos: Array<{ trabajadorId: string; nombre: string; montoActual: number; montoNuevo: number; respuesta: 'pendiente' | 'acepta' | 'rechaza' }>;
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const RESPUESTA = { pendiente: 'Falta que responda', acepta: 'Aceptó', rechaza: 'No aceptó' } as const;

export default function CambioDePresupuestoEnCurso({ jobId, version = 0, alCambiar, className = '' }: { jobId?: string; version?: number; alCambiar?: () => void; className?: string }) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [ocupado, setOcupado] = useState<'acepto' | 'rechazo' | 'cancelo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const leer = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/budget/solicitud`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setSolicitud(data.solicitud);
    } catch {
      /* Es una lectura: si falla, la red de errores avisa y se vuelve a leer con el próximo cambio en vivo. */
    }
  }, [jobId]);

  useEffect(() => {
    void leer();
  }, [leer, version]);
  useEventoEnVivo(['job:updated', 'contract:updated', 'notification:new', 'socket:reconectado'], () => void leer());

  const pedir = async (cual: 'acepto' | 'rechazo' | 'cancelo') => {
    setOcupado(cual);
    setError(null);
    try {
      const res = await fetch(cual === 'cancelo' ? `/api/jobs/${jobId}/budget/solicitud` : `/api/jobs/${jobId}/budget/solicitud/responder`, {
        method: cual === 'cancelo' ? 'DELETE' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: cual === 'cancelo' ? undefined : JSON.stringify({ acepta: cual === 'acepto' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'No pudimos guardar tu respuesta. Probá de nuevo.');
      setResultado(data.message);
      alCambiar?.();
    } catch (e: any) {
      setError(e?.message || 'No pudimos guardar tu respuesta. Revisá tu conexión y probá de nuevo.');
    } finally {
      setOcupado(null);
      await leer();
    }
  };

  const mio = solicitud?.soy === 'elegido' ? solicitud.elegidos[0] : null;

  return (
    <Transicion mostrar={Boolean(solicitud || resultado || error)} className={className}>
      {(solicitud || resultado || error) && (
        <section data-testid="cambio-de-presupuesto" aria-label="Cambio de presupuesto" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 dark:border-amber-600 dark:bg-amber-900/20">
          <h2 className="flex items-center gap-2 text-base font-bold text-amber-900 dark:text-amber-200">
            <DollarSign className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            {mio ? 'Te piden cambiar el presupuesto' : 'Cambio de presupuesto'}
          </h2>

          {solicitud && (
            <>
              <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                {mio ? 'Tu pago pasaría de ' : 'El presupuesto pasaría de '}
                <strong>{pesos(solicitud.precioAnterior)}</strong> a <strong>{pesos(solicitud.precioNuevo)}</strong>.
              </p>
              <p className="mt-1 break-words text-sm text-slate-700 dark:text-slate-300">Motivo: {solicitud.motivo}</p>

              {solicitud.soy === 'cliente' && (
                <ul className="mt-3 space-y-1" data-testid="quien-respondio">
                  {solicitud.elegidos.map((e) => (
                    <li key={e.trabajadorId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                      <span>
                        {e.nombre}: {pesos(e.montoActual)} → {pesos(e.montoNuevo)}
                      </span>
                      <span className="font-semibold">{RESPUESTA[e.respuesta]}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                {solicitud.estado === 'esperando_pago'
                  ? 'Ya aceptaron. El presupuesto cambia cuando la diferencia quede paga y aprobada.'
                  : mio
                    ? 'Se cambia solo si lo aceptás. Mientras tanto todo sigue como está.'
                    : 'Se aplica recién cuando acepten todas las personas elegidas.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {mio && mio.respuesta === 'pendiente' && solicitud.estado === 'esperando_respuesta' && (
                  <>
                    <button type="button" data-testid="aceptar-presupuesto" disabled={!!ocupado} onClick={() => void pedir('acepto')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                      {ocupado === 'acepto' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Acepto el cambio
                    </button>
                    <button type="button" data-testid="rechazar-presupuesto" disabled={!!ocupado} onClick={() => void pedir('rechazo')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {ocupado === 'rechazo' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} No acepto
                    </button>
                  </>
                )}
                {solicitud.soy === 'cliente' && solicitud.estado === 'esperando_pago' && (
                  <Link to={`/jobs/${jobId}/payment?reason=budget_increase`} data-testid="pagar-la-diferencia" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
                    Pagar la diferencia
                  </Link>
                )}
                {solicitud.soy === 'cliente' && (
                  <button type="button" data-testid="retirar-el-pedido" disabled={!!ocupado} onClick={() => void pedir('cancelo')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {ocupado === 'cancelo' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Retirar el pedido
                  </button>
                )}
              </div>
            </>
          )}

          <Transicion mostrar={!!resultado}>{resultado && <p role="status" className="mt-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">{resultado}</p>}</Transicion>
          <Transicion mostrar={!!error}>{error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}</Transicion>
        </section>
      )}
    </Transicion>
  );
}
