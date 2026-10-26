import { ShieldCheck, Clock, CheckCircle } from 'lucide-react';
import { frasesDeLiquidacion, TITULO_DEL_ESTADO, type LiquidacionDelContrato } from '../../shared/pagos/liquidacion';

/**
 * «Cuándo se liquida el dinero»: qué pasa con el pago de un contrato (en custodia, esperando confirmación, liberado) y desde cuándo lo puede retirar el trabajador.
 * Los datos y las frases vienen del servidor y de `shared/pagos/liquidacion.ts`: la app cuenta lo mismo.
 */
export default function LiquidacionDelPago({ liquidacion, rol = 'otro' }: { liquidacion?: LiquidacionDelContrato | null; rol?: 'trabajador' | 'cliente' | 'otro' }) {
  if (!liquidacion) return null;
  const frases = frasesDeLiquidacion(liquidacion, rol);
  if (frases.length === 0) return null;
  const Icono = liquidacion.estado === 'liberado' ? CheckCircle : liquidacion.estado === 'esperando_confirmacion' ? Clock : ShieldCheck;

  return (
    <div
      data-testid="liquidacion-del-pago"
      className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-100"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {TITULO_DEL_ESTADO[liquidacion.estado]}
      </p>
      <ul className="mt-1.5 space-y-1.5 leading-snug">
        {frases.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {liquidacion.esEstimado && <p className="mt-1.5 text-[11px] opacity-75">Las fechas son una estimación: se confirman cuando el trabajo se da por terminado.</p>}
    </div>
  );
}
