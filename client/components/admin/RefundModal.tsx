import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Devolver dinero de un pago.
 *
 * Vive como componente propio y no dentro de la pantalla de pagos porque el
 * mismo flujo hace falta en varios lugares -- resolver una disputa, cancelar un
 * trabajo, conceder un contracargo -- y tener tres copias de una pantalla que
 * mueve plata es cómo terminan divergiendo.
 *
 * El principio de todo lo que hay acá: el que aprieta el botón tiene que ver
 * exactamente cuánto sale y a dónde va, antes de apretarlo. Una devolución no
 * se deshace.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama cuando la devolución salió bien, para que la pantalla recargue. */
  onListo?: () => void;
  pago: {
    id: string;
    amount: number;
    currency?: string;
    refundedAmount?: number;
    payerName?: string;
    description?: string;
  } | null;
}

export default function RefundModal({ abierto, onCerrar, onListo, pago }: Props) {
  const { token } = useAuth();
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [esFinal, setEsFinal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se limpia al abrir. Sin esto, el motivo escrito para una devolución anterior
  // queda cargado en la siguiente, y ese texto es el que después explica el
  // movimiento en el registro.
  useEffect(() => {
    if (abierto) {
      setMonto('');
      setMotivo('');
      setEsFinal(false);
      setError(null);
    }
  }, [abierto, pago?.id]);

  if (!abierto || !pago) return null;

  const total = Number(pago.amount) || 0;
  const yaDevuelto = Number(pago.refundedAmount) || 0;
  const disponible = Math.round((total - yaDevuelto) * 100) / 100;
  const importe = monto.trim() === '' ? disponible : Number(monto);
  const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;

  const montoInvalido =
    monto.trim() !== '' && (!(importe > 0) || importe > disponible || Number.isNaN(importe));
  const quedaResto = importe > 0 && importe < disponible;

  const devolver = async () => {
    if (montoInvalido || motivo.trim().length < 10) return;

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${pago.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          // Vacío significa "todo lo que queda": se manda undefined para que el
          // servidor calcule el remanente con la fila bloqueada, en vez de
          // confiar en el número que esta pantalla leyó hace un rato.
          monto: monto.trim() === '' ? undefined : importe,
          motivo: motivo.trim(),
          esFinal,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        // El 403 de doble confirmación no es un error del usuario: es el
        // control pidiendo 2FA. Se dice así y no como "falló".
        // Todo mensaje que se muestra pasa por un respaldo. Un `undefined`
        // interpolado en un cartel de error es peor que un mensaje genérico:
        // le dice al usuario que algo se rompió sin decirle qué.
        const detalle = data.message || 'No se pudo procesar la devolución';
        setError(
          data.requiereVerificacion
            ? `${detalle} Confirmá tu identidad y volvé a intentar.`
            : detalle,
        );
        return;
      }

      onListo?.();
      onCerrar();
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Devolver dinero</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {pago.description || 'Pago'}
              {pago.payerName && <> · {pago.payerName}</>}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* El estado del pago va arriba de todo: sin saber cuánto ya se
              devolvió, cualquier monto que se escriba es a ciegas. */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-slate-600 dark:text-slate-400">Pago original</span>
              <span className="font-medium text-slate-900 dark:text-white">{pesos(total)}</span>
            </div>
            {yaDevuelto > 0 && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600 dark:text-slate-400">Ya devuelto</span>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  −{pesos(yaDevuelto)}
                </span>
              </div>
            )}
            <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40">
              <span className="font-semibold text-slate-900 dark:text-white">
                Se puede devolver hasta
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {pesos(disponible)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Monto a devolver
            </label>
            <input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={`Vacío = todo (${pesos(disponible)})`}
              min={0}
              max={disponible}
              className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white ${
                montoInvalido
                  ? 'border-rose-400 dark:border-rose-600'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            />
            {montoInvalido && (
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Tiene que estar entre $1 y {pesos(disponible)}.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Por qué se devuelve
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej: se canceló el trabajo antes de contratar"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Es lo que va a explicar este movimiento dentro de seis meses. Mínimo diez caracteres.
            </p>
          </div>

          {/* Sólo aparece cuando hay un resto: preguntarlo siempre convierte una
              decisión real en una casilla que se tilda sin leer. */}
          {quedaResto && (
            <label className="flex gap-3 items-start rounded-lg border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={esFinal}
                onChange={(e) => setEsFinal(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-sky-600"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900 dark:text-white">
                  Cerrar el pago con esta devolución
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Van a quedar {pesos(disponible - importe)} sin devolver, retenidos a propósito —
                  la comisión y el costo de procesamiento en una cancelación, o la parte del trabajador
                  en una disputa resuelta a medias. Marcado, no se van a poder devolver después.
                </span>
              </span>
            </label>
          )}

          {error && (
            <div className="flex gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-800 dark:text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 p-5">
          {/* El monto final, grande y a la izquierda. Es el único número que
              importa en el momento de apretar. */}
          <div className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">Se devuelven </span>
            <span className="font-bold text-lg text-slate-900 dark:text-white">
              {pesos(montoInvalido ? 0 : importe)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCerrar}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              onClick={devolver}
              disabled={enviando || montoInvalido || motivo.trim().length < 10}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Devolver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
