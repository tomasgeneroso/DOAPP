import { useTranslation } from "react-i18next";
import { AlertTriangle, Ban } from "lucide-react";
import { POLITICAS } from "../../shared/constants/policies";

/**
 * La escalera de cancelaciones, del lado de quien la ve.
 *
 * Dos piezas y dos públicos:
 *
 *   CancellationMark   la ve el CLIENTE en el perfil o la postulación del
 *                      trabajador. Es el segundo escalón (T&C 9.4) y sólo
 *                      sirve si aparece justo donde el cliente elige. Una
 *                      marca que nadie ve no disuade nada.
 *
 *   SuspendedNotice    la ve el TRABAJADOR en vez del botón de postularse.
 *                      Tiene que enterarse antes de intentar, no con un 403.
 */

function vigente(hasta?: string | null): Date | null {
  if (!hasta) return null;
  const d = new Date(hasta);
  return d > new Date() ? d : null;
}

function fecha(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

export function CancellationMark({ until, compact = false }: { until?: string | null; compact?: boolean }) {
  const { t } = useTranslation();
  const hasta = vigente(until);
  if (!hasta) return null;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200"
        title={t(
          "ladder.markTitle",
          "Canceló trabajos que había aceptado en los últimos {{dias}} días",
          { dias: POLITICAS.CANCELACION_VENTANA_DIAS },
        )}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {t("ladder.markShort", "Canceló trabajos")}
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{t("ladder.markTitleLong", "Canceló trabajos que había aceptado")}</p>
        <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
          {t(
            "ladder.markDetail",
            "Más de una vez en los últimos {{dias}} días. La marca se retira sola el {{fecha}}.",
            { dias: POLITICAS.CANCELACION_VENTANA_DIAS, fecha: fecha(hasta) },
          )}
        </p>
      </div>
    </div>
  );
}

export function SuspendedNotice({ until }: { until?: string | null }) {
  const { t } = useTranslation();
  const hasta = vigente(until);
  if (!hasta) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-900 dark:text-red-100"
    >
      <Ban className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {t("ladder.suspendedTitle", "No podés postularte hasta el {{fecha}}", { fecha: fecha(hasta) })}
        </p>
        <p className="text-xs mt-1 text-red-800 dark:text-red-200">
          {t(
            "ladder.suspendedDetail",
            "Es por cancelar trabajos que habías aceptado. Los contratos que ya tenés en curso siguen igual. Si hubo un motivo de fuerza mayor, escribile a soporte con el detalle.",
          )}
        </p>
      </div>
    </div>
  );
}
