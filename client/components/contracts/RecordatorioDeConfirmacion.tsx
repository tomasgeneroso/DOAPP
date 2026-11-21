import { Info } from 'lucide-react';
import { POLITICAS } from '../../../shared/constants/policies';

/**
 * El recordatorio para el trabajador (pedido del dueño, 2026-11-21): tiene que tocar «Completé el trabajo» al terminar; si no lo hace y quien contrató no se opone, el
 * contrato se confirma solo a las 24 horas de la hora de fin y se libera el pago (T&C 7.6). Se muestra al ser elegido y mientras el trabajo está en marcha.
 */
export default function RecordatorioDeConfirmacion({ className = '' }: { className?: string }) {
  return (
    <p role="note" className={`flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-100 ${className}`} data-testid="recordatorio-de-confirmacion">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Cuando termines tocá <strong>«Completé el trabajo»</strong>. Si no lo hacés, el trabajo se confirma solo {POLITICAS.AUTO_CONFIRMACION_HORAS} horas después de la hora de fin, siempre que quien contrató no se oponga.
      </span>
    </p>
  );
}
