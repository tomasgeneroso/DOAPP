import { Briefcase, Hammer, Users } from 'lucide-react';
import SelectorDeRubros from './SelectorDeRubros';

/**
 * «Quiero…» del registro (pedido del dueño, 2026-11-12): contratar (cliente), trabajar (trabajador) o las dos cosas. Si trabaja, elige sus rubros.
 */
export type TipoDeCuenta = 'client' | 'worker' | 'both';

interface Props {
  tipo: TipoDeCuenta;
  onTipo: (t: TipoDeCuenta) => void;
  rubros: string[];
  cualquier: boolean;
  onRubros: (r: string[]) => void;
  onCualquier: (v: boolean) => void;
  errorRubros?: string;
}

const OPCIONES: Array<{ id: TipoDeCuenta; titulo: string; detalle: string; Icono: typeof Briefcase }> = [
  { id: 'client', titulo: 'Cliente', detalle: 'Quiero contratar servicios', Icono: Briefcase },
  { id: 'worker', titulo: 'Trabajador', detalle: 'Quiero ofrecer mis servicios', Icono: Hammer },
  { id: 'both', titulo: 'Ambos', detalle: 'Contrato y trabajo', Icono: Users },
];

export default function SelectorDeTipoDeCuenta({ tipo, onTipo, rubros, cualquier, onRubros, onCualquier, errorRubros }: Props) {
  return (
    <div className="space-y-4" data-testid="selector-de-tipo-de-cuenta">
      <fieldset>
        <legend className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
          ¿Cómo vas a usar DOAPP? <span className="text-red-500">*</span>
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de cuenta">
          {OPCIONES.map(({ id, titulo, detalle, Icono }) => {
            const activo = tipo === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => onTipo(id)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-colors ${
                  activo
                    ? 'border-sky-600 bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
                }`}
              >
                <Icono className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-semibold">{titulo}</span>
                <span className="text-[11px] leading-tight opacity-80">{detalle}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {(tipo === 'worker' || tipo === 'both') && (
        <SelectorDeRubros rubros={rubros} cualquier={cualquier} onRubros={onRubros} onCualquier={onCualquier} error={errorRubros} />
      )}
    </div>
  );
}
