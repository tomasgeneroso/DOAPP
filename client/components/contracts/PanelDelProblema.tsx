import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PauseCircle, CheckCircle, Scale, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import ConfirmModal from '../ui/ConfirmModal';
import { TEXTO_DEL_PROBLEMA, tituloDeProblema, type ProblemaDelTrabajo } from '../../../shared/tickets/problemasDelTrabajo';

/**
 * Lo que se ofrece en un ticket de «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21): mientras está abierto, el pago no se libera. Se puede
 *  - seguir con el mismo trabajo (se arregló o fue un malentendido): el ticket queda resuelto y quien contrató acepta el fin del trabajo de nuevo; o
 *  - llevarlo a un reclamo, que decide el equipo de DOAPP.
 * Lo ven quien contrató (desde su ticket) y el equipo (desde el panel).
 */
export default function PanelDelProblema({ ticketId, problema, comoEquipo = false, onCambio }: { ticketId: string; problema: ProblemaDelTrabajo; comoEquipo?: boolean; onCambio: () => void | Promise<void> }) {
  const { token } = useAuth();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!problema.abierto) return null;

  const seguir = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/seguir-con-el-trabajo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setConfirmando(false);
        await onCambio();
      } else {
        setConfirmando(false);
        setError(data?.message || 'No pudimos resolver el ticket. Probá de nuevo.');
      }
    } catch {
      setConfirmando(false);
      setError('No pudimos resolver el ticket. Revisá tu conexión y probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-900/20" data-testid="panel-del-problema">
      <div className="flex items-start gap-3">
        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-amber-900 dark:text-amber-100">Hubo problemas durante el trabajo: {tituloDeProblema(problema.categoria).toLowerCase()}</h2>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">{TEXTO_DEL_PROBLEMA.pausa}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/40">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{TEXTO_DEL_PROBLEMA.seguir}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{TEXTO_DEL_PROBLEMA.seguirAyuda}</p>
              <button
                type="button"
                disabled={!problema.puedeSeguirConElTrabajo || enviando}
                onClick={() => setConfirmando(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="seguir-con-el-mismo-trabajo"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle className="h-4 w-4" aria-hidden="true" />}
                {TEXTO_DEL_PROBLEMA.seguir}
              </button>
              {!problema.puedeSeguirConElTrabajo && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">El contrato ya no está en marcha: no hay nada que retomar.</p>}
            </div>

            <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/40">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{TEXTO_DEL_PROBLEMA.reclamo}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{TEXTO_DEL_PROBLEMA.reclamoAyuda}</p>
              {comoEquipo ? (
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">El reclamo lo abre quien contrató desde su ticket. Si hace falta, escribile en la conversación.</p>
              ) : (
                <Link
                  to={`/disputes/create?contractId=${encodeURIComponent(problema.contractId)}&category=${encodeURIComponent(problema.categoria)}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  data-testid="llevar-a-reclamo"
                >
                  <Scale className="h-4 w-4" aria-hidden="true" />
                  {TEXTO_DEL_PROBLEMA.reclamo}
                </Link>
              )}
            </div>
          </div>

          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300" data-testid="panel-del-problema-error">{error}</p>}
        </div>
      </div>

      <ConfirmModal
        open={confirmando}
        tone="info"
        title="¿Seguimos con el mismo trabajo?"
        message={comoEquipo
          ? 'El ticket queda resuelto y el contrato sigue. Quien contrató podrá aceptar el fin del trabajo de nuevo, con un plazo nuevo de 24 horas antes de que se confirme solo.'
          : 'El ticket queda resuelto y el trabajo sigue. Vas a poder aceptar el fin del trabajo de nuevo; si no lo hacés, se confirma solo a las 24 horas.'}
        confirmLabel="Sí, seguir con el mismo trabajo"
        cancelLabel="Todavía no"
        loading={enviando}
        onConfirm={seguir}
        onClose={() => !enviando && setConfirmando(false)}
      />
    </section>
  );
}
