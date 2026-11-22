import { useState } from 'react';
import { Key, Copy, Check } from 'lucide-react';

/**
 * El código de emparejamiento, visible para TODAS las partes del contrato (pedido del dueño, 2026-11-22): en la vista del contrato y en la del trabajo.
 * El trabajador lo muestra al llegar; quien contrató lo compara y los dos lo confirman para que el contrato empiece con el trabajo hecho en persona.
 */
export default function CodigoDeEmparejamiento({
  codigo,
  vence,
  rol,
  nombreDelTrabajador,
  className = '',
}: {
  codigo?: string | null;
  vence?: string | Date | null;
  rol: 'trabajador' | 'cliente';
  /** En un trabajo de varios, de quién es este código. */
  nombreDelTrabajador?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  if (!codigo) return null;

  const copiar = () => {
    try {
      void navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin portapapeles: el código se ve igual */
    }
  };

  return (
    <div className={`rounded-xl border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 dark:border-purple-700 dark:from-purple-900/20 dark:to-indigo-900/20 ${className}`} data-testid="codigo-de-emparejamiento">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/50">
          <Key className="h-5 w-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-purple-900 dark:text-purple-100">
            Código de emparejamiento{nombreDelTrabajador ? ` · ${nombreDelTrabajador}` : ''}
          </h4>
          <p className="mb-2 text-xs text-purple-700 dark:text-purple-300">
            {rol === 'trabajador'
              ? 'Mostrale este código a quien te contrató cuando llegues al lugar del trabajo.'
              : 'El trabajador te va a mostrar este código cuando llegue. Tiene que ser el mismo que ves acá.'}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border-2 border-purple-300 bg-white p-2 dark:border-purple-600 dark:bg-slate-800">
              <p className="text-center font-mono text-xl font-bold tracking-widest text-purple-700 dark:text-purple-300" data-testid="codigo-de-emparejamiento-valor">{codigo}</p>
            </div>
            <button type="button" onClick={copiar} className="rounded-lg bg-purple-100 p-2.5 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-800/50" title="Copiar el código" aria-label="Copiar el código">
              {copiado ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
            </button>
          </div>
          {vence && <p className="mt-1.5 text-xs text-purple-600 dark:text-purple-400">Vence: {new Date(vence).toLocaleString('es-AR')}</p>}
        </div>
      </div>
    </div>
  );
}
