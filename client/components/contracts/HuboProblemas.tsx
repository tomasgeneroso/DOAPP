import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';

/**
 * «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21): lo ve quien contrató mientras el trabajo está en marcha o esperando confirmación. Sirve para decir que el
 * trabajo no se terminó o que hubo otro problema. Lleva al reclamo con la categoría ya elegida: abrir un reclamo detiene la confirmación automática (el contrato pasa a
 * «en reclamo») y lo revisa el equipo de DOAPP.
 */
const OPCIONES: Array<{ categoria: string; titulo: string; detalle: string }> = [
  { categoria: 'incomplete_work', titulo: 'El trabajo no se terminó', detalle: 'Quedó trabajo sin hacer.' },
  { categoria: 'service_not_delivered', titulo: 'No se presentó o no lo hizo', detalle: 'El trabajador no fue o no hizo el trabajo.' },
  { categoria: 'quality_issues', titulo: 'Se hizo, pero con problemas', detalle: 'El resultado no es el acordado o hay daños.' },
  { categoria: 'other', titulo: 'Hubo otro problema', detalle: 'Algo distinto a lo anterior.' },
];

export default function HuboProblemas({ contractId, className = '' }: { contractId: string; className?: string }) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => { setCategoria(null); setAbierto(true); }}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20 ${className}`}
        data-testid="hubo-problemas"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Hubo problemas durante el trabajo
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={() => setAbierto(false)} data-testid="hubo-problemas-dialogo">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">¿Qué pasó?</h3>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Elegí lo que mejor lo cuenta. Se abre un reclamo: <strong>la confirmación automática se detiene</strong> y el equipo de DOAPP lo revisa. El pago queda en custodia hasta que se resuelva.
            </p>
            <div className="space-y-2" role="radiogroup" aria-label="Qué pasó">
              {OPCIONES.map((o) => (
                <label key={o.categoria} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${categoria === o.categoria ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="radio" name="que-paso" value={o.categoria} checked={categoria === o.categoria} onChange={() => setCategoria(o.categoria)} className="mt-1" data-testid={`problema-${o.categoria}`} />
                  <span className="text-sm">
                    <span className="block font-medium text-slate-900 dark:text-white">{o.titulo}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{o.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="flex-1 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white">Cancelar</button>
              <button
                type="button"
                disabled={!categoria}
                onClick={() => navigate(`/disputes/create?contractId=${encodeURIComponent(contractId)}&category=${encodeURIComponent(categoria || 'other')}`)}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="hubo-problemas-continuar"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
