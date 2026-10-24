import { Link } from 'react-router-dom';
import { Clock, FileText, Briefcase } from 'lucide-react';
import Transicion from './ui/Transicion';
import { fechaDeLiquidacion, type CobroPendiente } from '../../shared/pagos/aFavorPendiente';

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * «Cobros pendientes»: una tarjeta por cada importe que figura a nombre de la persona pero todavía no puede usar o retirar, con el contrato y el trabajo de los que
 * viene, para poder abrirlos. Lo que llega de `GET /api/balance` → `cobrosPendientes`.
 *
 *  - `a_favor`: una devolución que espera a que la pasarela libere el pago original; todavía no está en el saldo.
 *  - `en_liberacion`: ya está en el saldo, pero se puede retirar recién desde la fecha.
 */
export default function CobrosPendientes({ cobros }: { cobros: CobroPendiente[] }) {
  return (
    <Transicion mostrar={cobros.length > 0} className="mb-8">
      {cobros.length > 0 && (
        <section aria-labelledby="cobros-pendientes-titulo" data-testid="cobros-pendientes">
          <h2 id="cobros-pendientes-titulo" className="text-lg font-bold text-gray-900 dark:text-white">
            Cobros pendientes
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
            Plata que ya te corresponde pero todavía no podés usar o retirar. Cada tarjeta dice de qué contrato viene.
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cobros.map((c) => {
              const aFavor = c.tipo === 'a_favor';
              return (
                <li
                  key={c.id}
                  data-testid="cobro-pendiente"
                  className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">{c.etiqueta}</p>
                      <span
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          aFavor
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
                        }`}
                      >
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {aFavor ? 'A favor pendiente' : 'En liberación'}
                      </span>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-gray-900 dark:text-white">{pesos(c.monto)}</p>
                  </div>

                  <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                    {aFavor
                      ? 'Todavía no es saldo: no lo podés usar ni retirar.'
                      : 'Ya está en tu saldo, pero todavía no lo podés retirar.'}
                    {c.disponibleDesde
                      ? ` ${aFavor ? 'Pasa a tu saldo' : 'Lo podés retirar'} el ${fechaDeLiquidacion(c.disponibleDesde)}.`
                      : ''}
                  </p>

                  {c.trabajo && (
                    <p className="mt-3 truncate text-sm text-gray-800 dark:text-gray-200" title={c.trabajo.titulo}>
                      <span className="text-gray-500 dark:text-gray-400">Trabajo: </span>
                      {c.trabajo.titulo}
                    </p>
                  )}

                  {(c.contrato || c.trabajo) && (
                    <div className="mt-4 flex flex-wrap gap-2 pt-1">
                      {c.contrato && (
                        <Link
                          to={`/contracts/${c.contrato.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          Ver contrato
                        </Link>
                      )}
                      {c.trabajo && (
                        <Link
                          to={`/jobs/${c.trabajo.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700"
                        >
                          <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                          Ver trabajo
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Transicion>
  );
}
