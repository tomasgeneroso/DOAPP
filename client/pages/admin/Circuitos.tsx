import { useMemo, useState } from 'react';
import { Workflow, HelpCircle, Code2, Search } from 'lucide-react';
import DiagramaDeCircuito from '../../components/admin/DiagramaDeCircuito';
import { CIRCUITOS, GRUPOS_DE_CIRCUITOS } from '../../content/circuitos';

/**
 * Circuitos de la plataforma: diagramas de flujo de todo lo importante (pagos, registro, trabajos, soporte, protocolos), con quién hace cada paso, qué pasa en cada decisión,
 * las preguntas que todavía hay que decidir y dónde vive cada cosa en el código. Contenido estático (`client/content/circuitos.ts`).
 */
export default function Circuitos() {
  const [grupo, setGrupo] = useState<string>('todos');
  const [buscar, setBuscar] = useState('');

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return CIRCUITOS.filter((c) => (grupo === 'todos' || c.grupo === grupo) && (!q || `${c.titulo} ${c.resumen} ${c.pasos.map((p) => p.texto).join(' ')}`.toLowerCase().includes(q)));
  }, [grupo, buscar]);

  return (
    <div className="space-y-6 pb-12" data-testid="circuitos">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-100 p-3 dark:bg-sky-900/30"><Workflow className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Circuitos de la plataforma</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Cómo funciona cada proceso de punta a punta: quién hace qué y qué pasa en cada decisión. Los números salen de la configuración, no se repiten a mano.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {['todos', ...GRUPOS_DE_CIRCUITOS].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrupo(g)}
            aria-pressed={grupo === g}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${grupo === g ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
          >
            {g === 'todos' ? 'Todos' : g}
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Buscar un circuito</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar (pago, retiro, ticket…)" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
        </label>
      </div>

      <nav aria-label="Índice de circuitos" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <ul className="grid gap-1 sm:grid-cols-2">
          {visibles.map((c) => (
            <li key={c.id}>
              <a href={`#circuito-${c.id}`} className="text-sm text-sky-700 hover:underline dark:text-sky-300"><span className="text-xs text-slate-400">{c.grupo} · </span>{c.titulo}</a>
            </li>
          ))}
        </ul>
      </nav>

      {visibles.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600">No hay circuitos con ese filtro.</p>}

      {visibles.map((c) => (
        <section key={c.id} id={`circuito-${c.id}`} className="scroll-mt-20 space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" data-testid="circuito">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">{c.grupo}</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{c.titulo}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{c.resumen}</p>
          </div>
          <DiagramaDeCircuito titulo={c.titulo} pasos={c.pasos} flechas={c.flechas} />
          {c.notas && c.notas.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Cómo funciona hoy</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {c.notas.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          {c.abiertas && c.abiertas.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20" data-testid="preguntas-abiertas">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200"><HelpCircle className="h-4 w-4" aria-hidden="true" />Para decidir</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-100">
                {c.abiertas.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          {c.codigo && c.codigo.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              {c.codigo.map((x) => <code key={x} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{x}</code>)}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
