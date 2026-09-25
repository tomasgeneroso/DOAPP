import { useTranslation } from "react-i18next";
import { AlertTriangle, ExternalLink } from "lucide-react";

/**
 * De dónde salió el tipo de cambio con el que está calculado un precio.
 *
 * Por qué existe: los precios fijados en euros se cobran en pesos al cambio
 * del día, así que el importe en pesos cambia solo de un mes a otro. Sin
 * explicación, eso se lee como un aumento encubierto —y quien lo piensa no
 * pregunta, se va—. Con la fuente y la fecha a la vista, el usuario puede ir a
 * verificarlo al mismo lugar del que lo sacamos.
 *
 * El caso `confiable: false` importa tanto como el normal: significa que se
 * cayeron todas las fuentes y el precio salió de un valor de respaldo escrito
 * a mano. Eso no puede quedar sólo en el log del servidor mientras al usuario
 * se le muestra un número con la misma cara de siempre.
 */

export interface Cotizacion {
  valor: number;
  origen: string;
  nombreDelOrigen: string;
  url?: string;
  confiable: boolean;
  actualizada: string;
}

function hace(iso: string, t: (k: string, d: string, o?: any) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return t("cotizacion.reciEn", "recién");
  if (min < 60) return t("cotizacion.haceMin", "hace {{n}} min", { n: min });
  const hs = Math.floor(min / 60);
  if (hs < 24) return t("cotizacion.haceHs", "hace {{n}} h", { n: hs });
  return t("cotizacion.haceDias", "hace {{n}} d", { n: Math.floor(hs / 24) });
}

export default function OrigenDeLaCotizacion({
  cotizacion,
  moneda = "EUR",
  className = "",
}: {
  cotizacion?: Cotizacion | null;
  /** Qué moneda se está convirtiendo a pesos. */
  moneda?: "EUR" | "USD";
  className?: string;
}) {
  const { t } = useTranslation();
  if (!cotizacion?.valor) return null;

  const importe = `$${cotizacion.valor.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  const desde = hace(cotizacion.actualizada, t as any);

  if (!cotizacion.confiable) {
    return (
      <p
        className={`flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 ${className}`}
        role="status"
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {t(
            "cotizacion.respaldo",
            "No pudimos consultar la cotización en este momento, así que el precio se calculó con un valor de referencia ({{importe}} por {{moneda}}). Puede diferir del que se cobre.",
            { importe, moneda },
          )}
        </span>
      </p>
    );
  }

  return (
    <p className={`text-xs text-slate-500 dark:text-slate-400 ${className}`}>
      {t("cotizacion.calculado", "Calculado a {{importe}} por {{moneda}}", { importe, moneda })}
      {" · "}
      {cotizacion.url ? (
        <a
          href={cotizacion.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline decoration-dotted hover:text-slate-700 dark:hover:text-slate-200"
        >
          {cotizacion.nombreDelOrigen}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : (
        cotizacion.nombreDelOrigen
      )}
      {desde ? ` · ${t("cotizacion.actualizada", "actualizada {{cuando}}", { cuando: desde })}` : ""}
    </p>
  );
}
