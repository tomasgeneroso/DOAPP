import { JOB_CATEGORIES } from '../../../shared/constants/categories';

/**
 * Rubros que ofrece un trabajador (pedido del dueño, 2026-11-12): uno o varios de los rubros de los trabajos, o «cualquier rubro». Lo usan el registro y
 * Configuración. Controlado: la pantalla que lo usa guarda los valores.
 */
interface Props {
  rubros: string[];
  cualquier: boolean;
  onRubros: (r: string[]) => void;
  onCualquier: (v: boolean) => void;
  error?: string;
}

export default function SelectorDeRubros({ rubros, cualquier, onRubros, onCualquier, error }: Props) {
  const alternar = (id: string) => onRubros(rubros.includes(id) ? rubros.filter((r) => r !== id) : [...rubros, id]);

  return (
    <fieldset data-testid="selector-de-rubros">
      <legend className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
        ¿En qué rubros trabajás? <span className="text-red-500">*</span>
      </legend>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={cualquier}
          onChange={(e) => onCualquier(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
        />
        Cualquier rubro
      </label>
      <div className={`mt-2 flex flex-wrap gap-2 ${cualquier ? 'opacity-50' : ''}`} role="group" aria-label="Rubros">
        {JOB_CATEGORIES.map((c) => {
          const activo = rubros.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => alternar(c.id)}
              aria-pressed={activo}
              disabled={cualquier}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                activo
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              <span aria-hidden="true">{c.icon}</span>
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Los rubros que elijas ayudan a que te encuentren en las búsquedas. Podés cambiarlos cuando quieras desde tu perfil.</p>
      {error && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </fieldset>
  );
}
