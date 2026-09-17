import { Clock, Hourglass } from "lucide-react";
import { edadDeDisputa } from "../../../shared/disputes/sla";

/**
 * Cuanto lleva una disputa, contra el objetivo interno (4 dias, tope 5).
 * Solo lo ven admin y soporte: es para que el equipo vea el tiempo que le
 * esta llevando cada una, no una promesa al usuario.
 *
 * Verde hasta el objetivo, ambar hasta el maximo, rojo despues. Si la disputa
 * esta esperando a una de las partes (awaiting_info) la demora no es del
 * equipo y se muestra en gris con un reloj de arena.
 */
export default function DisputeSlaBadge({
  createdAt,
  resolvedAt,
  status,
  compact = false,
}: {
  createdAt: Date | string;
  resolvedAt?: Date | string | null;
  status: string;
  compact?: boolean;
}) {
  const cerradaPorEstado = /^resolved|^cancelled|^closed/.test(status);
  const edad = edadDeDisputa(createdAt, {
    resueltaEl: resolvedAt || (cerradaPorEstado ? undefined : null),
    esperandoAParte: status === "awaiting_info",
  });

  // Resuelta sin fecha de resolucion: no hay nada honesto que medir.
  if (cerradaPorEstado && !resolvedAt) return null;

  const clases: Record<typeof edad.nivel, string> = {
    en_plazo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    al_limite: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    vencida: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    esperando: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  };

  const titulo = edad.cerrada
    ? `Se resolvió en ${edad.texto}. Objetivo del equipo: ${edad.objetivoDias} días, máximo ${edad.maximoDias}.`
    : edad.nivel === "esperando"
      ? `Abierta hace ${edad.texto}. Esperando a una de las partes: la demora no cuenta contra el equipo hasta los ${edad.maximoDias} días.`
      : edad.nivel === "vencida"
        ? `Abierta hace ${edad.texto}. Pasó el máximo de ${edad.maximoDias} días: hay plata de dos personas congelada.`
        : edad.nivel === "al_limite"
          ? `Abierta hace ${edad.texto}. Pasó el objetivo de ${edad.objetivoDias} días; el máximo es ${edad.maximoDias}.`
          : `Abierta hace ${edad.texto}. Objetivo: resolver en ${edad.objetivoDias} días.`;

  const Icono = edad.nivel === "esperando" ? Hourglass : Clock;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${clases[edad.nivel]}`}
      title={titulo}
      aria-label={titulo}
    >
      <Icono className="h-3 w-3" aria-hidden="true" />
      {edad.cerrada ? `resuelta en ${edad.texto}` : edad.texto}
      {!compact && !edad.cerrada && edad.nivel !== "esperando" && (
        <span className="opacity-70">/ {edad.objetivoDias} d</span>
      )}
      {!compact && edad.nivel === "esperando" && <span className="opacity-70">esperando parte</span>}
    </span>
  );
}
