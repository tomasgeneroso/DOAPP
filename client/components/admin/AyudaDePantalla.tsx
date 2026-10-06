import { Link } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { AYUDA_DE_PANTALLA, type PantallaConAyuda } from "../../content/guiaDelAnalisis";

/**
 * La ayuda corta de una pantalla: qué pregunta responde y en qué orden leerla.
 *
 * Va plegada para no estorbar a quien ya sabe leerla, y sale de la misma fuente
 * que la guía completa (`client/content/guiaDelAnalisis.ts`): si la guía cambia,
 * esto cambia con ella, no hay dos textos que mantener.
 */
export default function AyudaDePantalla({ pantalla }: { pantalla: PantallaConAyuda }) {
  const ayuda = AYUDA_DE_PANTALLA[pantalla];

  return (
    <details className="group mb-6 rounded-xl border border-sky-200 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-900/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium text-sky-800 marker:hidden dark:text-sky-300">
        <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {ayuda.titulo}
        <span className="ml-auto text-xs font-normal text-sky-600 group-open:hidden dark:text-sky-400">
          Mostrar
        </span>
        <span className="ml-auto hidden text-xs font-normal text-sky-600 group-open:inline dark:text-sky-400">
          Ocultar
        </span>
      </summary>

      <div className="border-t border-sky-200 px-4 pb-4 pt-3 dark:border-sky-800">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{ayuda.responde}</p>
        <ol className="mt-3 space-y-2">
          {ayuda.pasos.map((paso, i) => (
            <li key={paso} className="flex gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>
        <Link
          to="/analisis?tab=guia"
          className="mt-3 inline-block text-sm font-medium text-sky-700 underline decoration-dotted underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
        >
          Leer la guía completa del análisis
        </Link>
      </div>
    </details>
  );
}
