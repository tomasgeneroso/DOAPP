import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, LifeBuoy, AlertTriangle, ArrowRight } from "lucide-react";
import { CATALOGO_DE_PROBLEMAS, type ProblemaCatalogado } from "../../../shared/errores/catalogoDeProblemas";

/** Sin acentos y en minúscula: nadie escribe "retención" con tilde en un buscador. */
const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const GRAVEDAD: Record<ProblemaCatalogado["gravedad"], { texto: string; clase: string }> = {
  alta: { texto: "Plata en juego", clase: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  media: { texto: "Revisar hoy", clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  baja: { texto: "Informativo", clase: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300" },
};

/**
 * Guía de errores de dinero para administración.
 *
 * Cada problema que el sistema detecta al mover plata tiene un CÓDIGO. El aviso que le llega al admin (y el mensaje de error) trae ese
 * código y los números exactos de ese caso; acá está lo que significa, por qué pasa y qué hacer, paso a paso. El contenido sale de
 * `shared/errores/catalogoDeProblemas.ts`: el mismo que usa el servidor, así que no puede quedar un código sin explicar.
 */
export default function GuiaDeErrores() {
  const [q, setQ] = useState("");
  const { hash } = useLocation();
  const abierto = decodeURIComponent(hash.replace(/^#/, ""));

  const todos = useMemo(() => Object.values(CATALOGO_DE_PROBLEMAS) as ProblemaCatalogado[], []);
  const resultados = useMemo(() => {
    const t = normal(q.trim());
    if (!t) return todos;
    return todos.filter((p) =>
      normal([p.codigo, p.titulo, p.queSignifica, ...p.causas, ...p.queHacer.map((s) => s.texto)].join(" ")).includes(t),
    );
  }, [q, todos]);

  // Llega desde un aviso con #CODIGO: se desplaza hasta ese problema.
  useEffect(() => {
    if (!abierto) return;
    document.getElementById(abierto)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [abierto]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <LifeBuoy className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Guía de errores de dinero
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Cuando el sistema frena o detecta algo al mover plata, el aviso trae un código (por ejemplo{" "}
          <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-900">SALDO-NO-CIERRA-LIBRO</code>) y los números exactos de ese
          caso. Acá está qué significa, por qué pasa y qué hacer.
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar un código o una palabra: retiro, saldo, Mercado Pago…"
          aria-label="Buscar en la guía de errores"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
        {resultados.length === todos.length ? `${todos.length} problemas` : `${resultados.length} de ${todos.length} problemas`}
      </p>

      {resultados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Nada con «{q}». Si el aviso trae un código que no figura acá, avisá al equipo técnico: todo código tiene que estar explicado.
        </p>
      ) : (
        <div className="space-y-4">
          {resultados.map((p) => {
            const g = GRAVEDAD[p.gravedad];
            const resaltado = p.codigo === abierto;
            return (
              <article
                key={p.codigo}
                id={p.codigo}
                className={`scroll-mt-4 rounded-lg border bg-white p-5 transition-shadow dark:bg-slate-800 ${
                  resaltado ? "border-sky-500 shadow-lg ring-2 ring-sky-500/40" : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold tracking-wide text-sky-300">{p.codigo}</code>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${g.clase}`}>
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {g.texto}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{p.titulo}</h2>

                <section className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qué significa</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{p.queSignifica}</p>
                </section>

                <section className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por qué pasa</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
                    {p.causas.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </section>

                <section className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qué hacer</h3>
                  <ol className="mt-1 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    {p.queHacer.map((paso, i) => (
                      <li key={paso.texto} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                          {i + 1}
                        </span>
                        <span>
                          {paso.texto}
                          {paso.ruta && (
                            <Link to={paso.ruta} className="ml-2 inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-400">
                              Abrir <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qué se le dice al usuario</h3>
                  <p className="mt-1">«{p.paraElUsuario}»</p>
                </section>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
