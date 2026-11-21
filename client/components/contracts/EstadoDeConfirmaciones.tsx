import { Link } from 'react-router-dom';
import { CheckCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-react';

/**
 * Quién terminó el trabajo, quién lo aceptó y si hay un reclamo (pedido del dueño, 2026-11-21): lo ven las dos partes en la vista del trabajo, en «Partes del contrato» y en el contrato.
 *  - «terminó»: el trabajador tocó «Completé el trabajo».
 *  - «aceptó»: quien contrató aceptó el fin del trabajo.
 *  - reclamo: enlace al reclamo del contrato.
 */
export interface EstadoDeConfirmacionesProps {
  /** El trabajador avisó que terminó. */
  terminoElTrabajador: boolean;
  /** Quien contrató aceptó el fin del trabajo. */
  acepto: boolean;
  disputeId?: string | null;
  /** Para ir al contrato (solo si quien mira es parte). */
  contractId?: string | null;
  /** Qué se muestra: los dos estados o solo uno (en «Partes del contrato» cada parte tiene el suyo). */
  mostrar?: 'ambos' | 'trabajador' | 'cliente';
  className?: string;
}

const Estado = ({ hecho, si, no }: { hecho: boolean; si: string; no: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${hecho ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
    {hecho ? <CheckCircle className="h-3 w-3" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
    {hecho ? si : no}
  </span>
);

export default function EstadoDeConfirmaciones({ terminoElTrabajador, acepto, disputeId, contractId, mostrar = 'ambos', className = '' }: EstadoDeConfirmacionesProps) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-testid="estado-de-confirmaciones">
      {mostrar !== 'cliente' && <Estado hecho={terminoElTrabajador} si="Terminó el trabajo" no="Todavía no terminó" />}
      {mostrar !== 'trabajador' && <Estado hecho={acepto} si="Aceptó el trabajo" no="Todavía no aceptó" />}
      {disputeId && (
        <Link to={`/disputes/${disputeId}`} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300" data-testid="estado-en-reclamo">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          En reclamo · Ver
        </Link>
      )}
      {contractId && (
        <Link to={`/contracts/${contractId}`} className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400" data-testid="estado-ver-contrato">
          Ver contrato <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
