import { useState } from 'react';
import { Check } from 'lucide-react';
import Transicion from '@/components/ui/Transicion';
import { OCASIONES, type TrabajoDeOcasion } from '../../../shared/momentos/momentos';

/** «¿Estás preparando algo?»: elegir una ocasión muestra los trabajos que suele pedir; tocar uno completa el título y el rubro. Cada trabajo se publica aparte. */
export default function Ocasiones({ onElegir }: { onElegir: (t: TrabajoDeOcasion) => void }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [elegido, setElegido] = useState('');
  const ocasion = OCASIONES.find((o) => o.id === abierta);
  return (
    <section aria-label="Publicar según la ocasión" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">¿Estás preparando algo?</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">Opcional: te completa el título y el rubro.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OCASIONES.map((o) => (
          <button key={o.id} type="button" aria-expanded={abierta === o.id} onClick={() => setAbierta(abierta === o.id ? null : o.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${abierta === o.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
            {o.titulo}
          </button>
        ))}
      </div>
      <Transicion mostrar={!!ocasion}>
        {ocasion && (
          <div className="mt-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">{ocasion.frase} Cada trabajo se publica por separado.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ocasion.trabajos.map((t) => (
                <button key={t.titulo} type="button" onClick={() => { onElegir(t); setElegido(t.titulo); }}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 px-3 py-1.5 text-sm text-sky-800 dark:text-sky-200">
                  {elegido === t.titulo && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{t.titulo}
                </button>
              ))}
            </div>
          </div>
        )}
      </Transicion>
    </section>
  );
}
