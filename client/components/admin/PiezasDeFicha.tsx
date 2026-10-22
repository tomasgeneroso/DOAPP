import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

/**
 * Piezas visuales compartidas por las fichas del panel de administración (usuario, publicación...): formatos de plata y fecha, estados en
 * palabras, y los bloques «tarjeta» y «tabla». Así todas se ven y se leen igual.
 */
export function Etiqueta({ ok, si, no, pendiente }: { ok: boolean; si: string; no: string; pendiente?: boolean }) {
  if (ok) return <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" aria-hidden />{si}</span>;
  if (pendiente) return <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><CircleDashed className="h-4 w-4" aria-hidden />{no}</span>;
  return <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400"><XCircle className="h-4 w-4" aria-hidden />{no}</span>;
}

export function Tarjeta({ titulo, children, derecha }: { titulo: string; children: ReactNode; derecha?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</h2>
        {derecha}
      </div>
      {children}
    </section>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">{texto}</p>;
}

export function Tabla({ columnas, filas }: { columnas: string[]; filas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>{columnas.map((c) => <th key={c} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700/60 dark:bg-slate-800">
          {filas.map((f, i) => (
            <tr key={i} className="align-top">
              {f.map((celda, j) => <td key={j} className="px-3 py-2 text-slate-700 dark:text-slate-200">{celda}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

