import { ListTodo, Plus, X } from "lucide-react";
import { LARGO_MAXIMO_DE_TITULO, MAXIMO_DE_TAREAS, type TareaDeCreacion } from "../../../shared/jobs/tareasDeCreacion";

/**
 * Las tareas de un trabajo con «entrega por tareas»: los PASOS a seguir para terminarlo, cada uno con su día (opcional).
 * Son una ayuda para guiarse; no son los requisitos de finalización, que se toman como determinantes si hay un reclamo.
 */
const dia = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : undefined);

export default function TareasDelTrabajo({
  tareas,
  onChange,
  inicio,
  fin,
}: {
  tareas: TareaDeCreacion[];
  onChange: (t: TareaDeCreacion[]) => void;
  inicio: Date | null;
  /** null = todavía no se sabe (o no se eligió). */
  fin: Date | null;
}) {
  const min = dia(inicio);
  const max = dia(fin);
  const sinFechas = !inicio;

  const cambiar = (i: number, parche: Partial<TareaDeCreacion>) => onChange(tareas.map((t, n) => (n === i ? { ...t, ...parche } : t)));

  return (
    <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10 p-4 animate-fadeIn">
      <p className="flex items-center gap-2 text-sm font-semibold text-sky-800 dark:text-sky-300">
        <ListTodo className="h-4 w-4" aria-hidden="true" />
        Tareas: los pasos para terminar el trabajo
      </p>
      <p className="mt-1 text-xs text-sky-700 dark:text-sky-400">
        Cada tarea puede tener su día. Por ejemplo, para «Limpiar la casa»: «Cortar el pasto» el 15/6, «Regar las plantas» el 16/6. Son una guía para
        quien trabaja; lo que se toma como determinante para dar el trabajo por terminado son los <strong>requisitos</strong>, más abajo.
      </p>

      <ul className="mt-3 space-y-2">
        {tareas.map((t, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 animate-fadeIn">
            <span className="w-5 shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">{i + 1}.</span>
            <input
              type="text"
              value={t.title}
              maxLength={LARGO_MAXIMO_DE_TITULO}
              onChange={(e) => cambiar(i, { title: e.target.value })}
              placeholder={i === 0 ? "Ej: Cortar el pasto" : i === 1 ? "Ej: Regar las plantas" : "Ej: Limpiar el patio"}
              aria-label={`Tarea ${i + 1}`}
              className="min-w-[12rem] flex-1 rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm"
            />
            <input
              type="date"
              value={t.dueDate ?? ""}
              min={min}
              max={max}
              disabled={sinFechas}
              onChange={(e) => cambiar(i, { dueDate: e.target.value || null })}
              aria-label={`Día de la tarea ${i + 1}`}
              title={sinFechas ? "Elegí primero las fechas del trabajo" : "Día de esta tarea (opcional)"}
              className="rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm disabled:opacity-50"
            />
            <button type="button" onClick={() => onChange(tareas.filter((_, n) => n !== i))} className="p-1.5 text-red-500 hover:text-red-700 transition-colors" aria-label={`Quitar la tarea ${i + 1}`}>
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {sinFechas && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Para ponerle un día a cada tarea, elegí primero las fechas del trabajo.</p>}
      {tareas.length < MAXIMO_DE_TAREAS && (
        <button type="button" onClick={() => onChange([...tareas, { title: "", dueDate: null }])} className="mt-3 flex items-center gap-1.5 text-sm text-sky-700 hover:text-sky-800 dark:text-sky-400 transition-colors">
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar tarea
        </button>
      )}
    </div>
  );
}
