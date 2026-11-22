import { CheckCircle } from 'lucide-react';
import { cierreDeReclamo } from '../../../shared/disputes/estadoDeCierre';

/**
 * La resolución del reclamo, ARRIBA de todo (pedido del dueño, 2026-11-22): quien entra a un reclamo cerrado ve primero cómo terminó, con quién y cuándo.
 * Un reclamo sin resolución no dibuja nada.
 */
export default function ResolucionDelReclamo({
  estado,
  resolucion,
  tipo,
  resueltaEl,
  monto,
}: {
  estado: string;
  resolucion?: string | null;
  tipo?: string | null;
  resueltaEl?: string | Date | null;
  monto?: number | string | null;
}) {
  if (!resolucion) return null;
  const cierre = estado === 'cancelled' ? cierreDeReclamo(resolucion) : null;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-5 dark:border-green-800 dark:bg-green-900/30" data-testid="resolucion-del-reclamo">
      <div className="flex items-start gap-3">
        <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-green-900 dark:text-green-200">{cierre && !cierre.resuelto ? `Resolución: ${cierre.texto}` : 'Resolución'}</h2>
          <p className="mt-1 whitespace-pre-line text-green-800 dark:text-green-300">{resolucion}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-green-700 dark:text-green-400">
            {tipo && tipo !== 'no_action' && <span>Tipo: {tipo}</span>}
            {monto ? <span>Monto: ${monto}</span> : null}
            {resueltaEl && <span>{new Date(resueltaEl).toLocaleString('es-AR')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
