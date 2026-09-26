import { Flag, Lock, ArrowRight } from "lucide-react";
import { puedeReclamar, RECLAMO_DESHABILITADO } from "../../../shared/pagos/modoDePago";

/**
 * El botón de reclamo, apagado cuando no hay pago confirmado.
 *
 * Por qué apagado y no escondido: si desaparece, el usuario cree que la
 * plataforma no tiene reclamos y se va. Apagado con el motivo a la vista dice
 * dos cosas útiles a la vez —que existe, y qué falta para poder usarlo— y la
 * segunda es accionable: si el que mira es el cliente, lo que falta es que
 * pague, y el atajo lo lleva ahí.
 *
 * Y por qué apagado de verdad y no sólo visualmente: el servidor rechaza el
 * intento igual (`SIN_PAGO_VERIFICADO`). Un reclamo sobre una operación que
 * DOAPP no vio no se puede resolver de ninguna manera —no hay fondos, no hay
 * constancia, no hay nada sobre lo que decidir—, así que dejarlo abrir sería
 * prometer un servicio que después hay que incumplir a mano.
 */

export default function BotonReclamo({
  contrato,
  esCliente,
  onReclamar,
  onIrAPagar,
  className = "",
  compacto = false,
}: {
  contrato: { paymentMode?: string | null; paymentStatus?: string | null };
  esCliente: boolean;
  onReclamar: () => void;
  /** Adónde va el atajo cuando falta pagar. */
  onIrAPagar: () => void;
  className?: string;
  /** Versión chica, para listados. */
  compacto?: boolean;
}) {
  const habilitado = puedeReclamar(contrato);

  if (habilitado) {
    return compacto ? (
      <button
        type="button"
        onClick={onReclamar}
        className={`flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100 hover:text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30 ${className}`}
        title="Reportar un problema con este contrato"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        Reportar
      </button>
    ) : (
      <button
        type="button"
        onClick={onReclamar}
        className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-500 transition-all duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-red-800/60 dark:hover:bg-red-900/20 dark:hover:text-red-400 ${className}`}
        title="Reportar problemas con este contrato"
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
        Reportar problema
      </button>
    );
  }

  // El motivo va en el `title` además del texto visible: en el listado no
  // entra el párrafo entero, pero el que pasa el mouse tiene que poder leerlo.
  const motivo = RECLAMO_DESHABILITADO.motivo;

  if (compacto) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span
          className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          title={motivo}
          aria-disabled="true"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Reportar
        </span>
        {esCliente && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onIrAPagar();
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20"
          >
            {RECLAMO_DESHABILITADO.accionCliente}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 ${className}`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        Reportar problema — {RECLAMO_DESHABILITADO.titulo}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{motivo}</p>
      <button
        type="button"
        onClick={onIrAPagar}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
      >
        {esCliente ? RECLAMO_DESHABILITADO.accionCliente : RECLAMO_DESHABILITADO.accionTrabajador}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
