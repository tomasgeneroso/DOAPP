import { useId, useState } from 'react';
import { ShieldCheck, Clock, CheckCircle, ChevronDown } from 'lucide-react';
import Transicion from './ui/Transicion';
import { frasesDeLiquidacion, TITULO_DEL_ESTADO, type LiquidacionDelContrato } from '../../shared/pagos/liquidacion';

/**
 * «Cuándo se liquida el dinero»: qué pasa con el pago de un contrato (en custodia, esperando confirmación, liberado) y desde cuándo lo puede retirar el trabajador.
 * Los datos y las frases vienen del servidor y de `shared/pagos/liquidacion.ts`: la app cuenta lo mismo.
 * Plegable (pedido del dueño, 2026-11-20): el título dice en qué está el dinero y las frases largas se abren con un toque.
 */
export default function LiquidacionDelPago({ liquidacion, rol = 'otro' }: { liquidacion?: LiquidacionDelContrato | null; rol?: 'trabajador' | 'cliente' | 'otro' }) {
  const [abierto, setAbierto] = useState(false);
  const idDelPanel = useId();
  if (!liquidacion) return null;
  const frases = frasesDeLiquidacion(liquidacion, rol);
  if (frases.length === 0) return null;
  const Icono = liquidacion.estado === 'liberado' ? CheckCircle : liquidacion.estado === 'esperando_confirmacion' ? Clock : ShieldCheck;

  return (
    <div
      data-testid="liquidacion-del-pago"
      className="mt-3 rounded-lg border border-green-200 bg-green-50 text-xs text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-100"
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idDelPanel}
        className="flex w-full items-center gap-1.5 p-3 text-left font-semibold"
        data-testid="liquidacion-del-pago-titulo"
      >
        <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1">{TITULO_DEL_ESTADO[liquidacion.estado]}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <Transicion mostrar={abierto}>
        <div id={idDelPanel} className="px-3 pb-3">
          <ul className="space-y-1.5 leading-snug">
            {frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {liquidacion.esEstimado && <p className="mt-1.5 text-[11px] opacity-75">Las fechas son una estimación: se confirman cuando el trabajo se da por terminado.</p>}
        </div>
      </Transicion>
    </div>
  );
}
