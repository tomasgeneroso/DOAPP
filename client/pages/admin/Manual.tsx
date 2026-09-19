import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ExternalLink, BookOpen } from "lucide-react";
import { MANUAL, ROLES, type RolManual } from "./manualContenido";

/** Sin acentos y en minúscula: nadie escribe "publicación" con tilde en un buscador. */
const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * El manual del equipo, con buscador. Responde "cómo se hace esto" sin tener
 * que preguntarle a quien lo escribió.
 */
export default function Manual() {
  const [q, setQ] = useState("");
  const [rol, setRol] = useState<RolManual | "todos">("todos");

  const resultados = useMemo(() => {
    const t = normal(q.trim());
    return MANUAL.filter((e) => {
      if (rol !== "todos" && !e.roles.includes(rol)) return false;
      if (!t) return true;
      const heno = normal([e.titulo, e.resumen, e.claves.join(" "), e.cuerpo.join(" ")].join(" "));
      return heno.includes(t);
    });
  }, [q, rol]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <BookOpen className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Manual del equipo
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Cómo se hace cada cosa y por qué. Los plazos y porcentajes salen del código, así que lo que leés acá es lo que el sistema hace hoy.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="manual-buscar"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: contracargo, retiro, 72 horas, dirección…"
            aria-label="Buscar en el manual"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["todos", ...Object.keys(ROLES)] as Array<RolManual | "todos">).map((r) => (
            <button
              key={r}
              onClick={() => setRol(r)}
              aria-pressed={rol === r}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                rol === r
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {r === "todos" ? "Todos" : ROLES[r as RolManual]}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
        {resultados.length === MANUAL.length
          ? `${MANUAL.length} procesos`
          : `${resultados.length} de ${MANUAL.length} procesos`}
      </p>

      {resultados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Nada con «{q}». Probá con otra palabra, o preguntale al equipo y agregá el proceso al manual
          (<code className="text-xs">client/pages/admin/manualContenido.ts</code>).
        </p>
      ) : (
        <div className="space-y-4">
          {resultados.map((e) => (
            <article key={e.id} id={e.id} className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{e.titulo}</h2>
                <div className="flex flex-wrap gap-1">
                  {e.roles.map((r) => (
                    <span key={r} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {ROLES[r]}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{e.resumen}</p>
              <div className="mt-3 space-y-2">
                {e.cuerpo.map((p, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-xs dark:[&_code]:bg-slate-900"
                    dangerouslySetInnerHTML={{ __html: p }}
                  />
                ))}
              </div>
              {e.links && e.links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {e.links.map((l) =>
                    l.externo ? (
                      <a
                        key={l.href}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
                      >
                        {l.texto} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <Link key={l.href} to={l.href} className="text-sm font-medium text-sky-600 hover:underline dark:text-sky-400">
                        {l.texto}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
