import { useState } from "react";
import { ShieldCheck, ShieldOff, ChevronDown, AlertTriangle, Scale } from "lucide-react";
import { COMO_FUNCIONA, type ModoDePago } from "../../../shared/pagos/modoDePago";

/**
 * Los dos modos de pago, explicados uno al lado del otro.
 *
 * Se muestran juntos y no por separado a propósito. Un usuario que ve sólo el
 * modo que está por elegir no tiene con qué compararlo, y la diferencia entre
 * los dos no es un detalle de implementación: es quién corre el riesgo. Eso
 * se entiende viendo los dos, no leyendo uno.
 *
 * Arranca cerrado. Quien ya sabe cómo funciona no necesita volver a leerlo en
 * cada publicación, y quien no sabe encuentra la pregunta escrita con las
 * palabras con las que la haría: "¿cómo funciona el pago?".
 *
 * El texto sale de `shared/pagos/modoDePago.ts`, igual que los avisos y las
 * cláusulas de los términos. Si esta pantalla explicara el modo con sus
 * propias palabras, tarde o temprano explicaría algo que el código no hace.
 */

const ICONOS: Record<ModoDePago, typeof ShieldCheck> = {
  escrow: ShieldCheck,
  on_completion: ShieldOff,
};

const ACENTOS: Record<ModoDePago, { borde: string; icono: string; titulo: string; fondo: string }> = {
  escrow: {
    borde: "border-emerald-300 dark:border-emerald-700/60",
    icono: "text-emerald-600 dark:text-emerald-400",
    titulo: "text-emerald-900 dark:text-emerald-200",
    fondo: "bg-emerald-50/60 dark:bg-emerald-900/15",
  },
  on_completion: {
    borde: "border-amber-300 dark:border-amber-700/60",
    icono: "text-amber-600 dark:text-amber-400",
    titulo: "text-amber-900 dark:text-amber-200",
    fondo: "bg-amber-50/60 dark:bg-amber-900/15",
  },
};

function Modo({ modo }: { modo: ModoDePago }) {
  const info = COMO_FUNCIONA[modo];
  const Icono = ICONOS[modo];
  const a = ACENTOS[modo];

  return (
    <div className={`rounded-lg border ${a.borde} ${a.fondo} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <Icono className={`h-5 w-5 shrink-0 ${a.icono}`} aria-hidden="true" />
        <h4 className={`font-semibold ${a.titulo}`}>{info.nombre}</h4>
      </div>

      <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">{info.resumen}</p>

      <ol className="mb-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
        {info.pasos.map((paso, i) => (
          <li key={paso} className="flex gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${a.icono} ring-1 ring-current`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>{paso}</span>
          </li>
        ))}
      </ol>

      <dl className="space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
        <div className="flex gap-2">
          <dt className="sr-only">Riesgo</dt>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <dd className="text-slate-600 dark:text-slate-400">{info.riesgo}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">Reclamo</dt>
          <Scale className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <dd className="text-slate-600 dark:text-slate-400">{info.reclamo}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function ComoFuncionaElPago({
  className = "",
  abiertoPorDefecto = false,
}: {
  className?: string;
  abiertoPorDefecto?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
      >
        ¿Cómo funciona el pago?
        <ChevronDown
          className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Modo modo="escrow" />
          <Modo modo="on_completion" />
        </div>
      )}
    </div>
  );
}
