import { BookOpen, Info, AlertTriangle } from "lucide-react";
import {
  GUIA,
  type Bloque,
  type PantallaExplicada,
  type Pregunta,
  type Termino,
} from "../../content/guiaDelAnalisis";

/**
 * La guía del análisis: qué es, de qué partes se compone y cómo se lee.
 *
 * El contenido vive en `client/content/guiaDelAnalisis.ts`, que arma sus cifras
 * con las mismas constantes y la misma cuenta que usan las pantallas. Acá sólo se
 * dibuja. Se separó así para que la ayuda corta de cada pantalla (`AyudaDePantalla`)
 * y esta guía completa salgan de una sola fuente y no puedan contradecirse.
 */

const TARJETA =
  "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 md:p-6";

function Terminos({ items }: { items: Termino[] }) {
  return (
    <dl className="divide-y divide-slate-100 dark:divide-slate-700/60">
      {items.map((t) => (
        <div key={t.termino} className="py-3 first:pt-0 last:pb-0">
          <dt className="font-semibold text-slate-900 dark:text-white">{t.termino}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t.definicion}</dd>
          {t.formula && (
            <dd className="mt-2 inline-block rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {t.formula}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function Pantallas({ items }: { items: PantallaExplicada[] }) {
  return (
    <div className="space-y-4">
      {items.map((p) => (
        <div
          key={p.nombre}
          className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
        >
          <h4 className="font-semibold text-slate-900 dark:text-white">{p.nombre}</h4>
          <dl className="mt-2 space-y-2 text-sm leading-relaxed">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Qué muestra
              </dt>
              <dd className="text-slate-600 dark:text-slate-300">{p.muestra}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cómo leerla
              </dt>
              <dd className="text-slate-600 dark:text-slate-300">{p.comoLeerla}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function Preguntas({ items }: { items: Pregunta[] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
      {items.map((p) => (
        <details key={p.pregunta} className="group p-4">
          <summary className="cursor-pointer list-none font-medium text-slate-900 marker:hidden dark:text-white">
            <span className="mr-2 inline-block text-sky-600 transition group-open:rotate-90 dark:text-sky-400" aria-hidden="true">
              ›
            </span>
            {p.pregunta}
          </summary>
          <p className="mt-2 pl-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.respuesta}</p>
        </details>
      ))}
    </div>
  );
}

function BloqueDeGuia({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case "parrafo":
      return <p className="leading-relaxed text-slate-700 dark:text-slate-300">{bloque.texto}</p>;

    case "subtitulo":
      return (
        <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {bloque.texto}
        </h3>
      );

    case "lista":
      return (
        <ul className="space-y-2 pl-1">
          {bloque.items.map((item) => (
            <li key={item} className="flex gap-2.5 leading-relaxed text-slate-700 dark:text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "pasos":
      return (
        <ol className="space-y-3">
          {bloque.items.map((item, i) => (
            <li key={item} className="flex gap-3 leading-relaxed text-slate-700 dark:text-slate-300">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case "formula":
      return (
        <div className="rounded-lg bg-slate-900 p-4 font-mono text-sm leading-7 text-slate-100">
          {bloque.lineas.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      );

    case "aviso": {
      const cuidado = bloque.tono === "cuidado";
      const Icono = cuidado ? AlertTriangle : Info;
      return (
        <div
          className={`flex gap-3 rounded-lg border p-4 text-sm leading-relaxed ${
            cuidado
              ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
              : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200"
          }`}
        >
          <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{bloque.texto}</p>
        </div>
      );
    }

    case "terminos":
      return <Terminos items={bloque.items} />;

    case "pantallas":
      return <Pantallas items={bloque.items} />;

    case "preguntas":
      return <Preguntas items={bloque.items} />;
  }
}

export default function GuiaDelAnalisis() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <BookOpen className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Guía del análisis
        </h1>
        <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">
          Qué es este análisis, de qué partes se compone, cómo se leen los números y para qué sirve cada
          pantalla. Está pensada para quien lo ve por primera vez: no hace falta venir de finanzas.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Índice. En pantallas anchas queda a la vista mientras se lee. */}
        <nav aria-label="Índice de la guía" className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            En esta guía
          </p>
          <ol className="space-y-1 text-sm">
            {GUIA.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex gap-2 rounded-md px-2 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-slate-400" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{s.titulo}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 max-w-3xl space-y-6">
          {GUIA.map((s, i) => (
            <section key={s.id} id={s.id} className={`${TARJETA} scroll-mt-6`}>
              <p className="font-mono text-xs uppercase tracking-widest text-sky-600 dark:text-sky-400">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{s.titulo}</h2>
              <div className="mt-4 space-y-4">
                {s.bloques.map((b, j) => (
                  <BloqueDeGuia key={j} bloque={b} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
