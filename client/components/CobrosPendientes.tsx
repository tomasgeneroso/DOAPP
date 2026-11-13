import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, FileText, Briefcase, CheckCircle2, Send } from 'lucide-react';
import Transicion from './ui/Transicion';
import { fechaDeLiquidacion, type CobroPendiente } from '../../shared/pagos/aFavorPendiente';
import { diasQueFaltan, textoDelCobro } from '../../shared/pagos/cobroEnEspera';

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * «Cobros pendientes»: una tarjeta por cada importe que figura a nombre de la persona pero todavía no puede usar o retirar, con el contrato y el trabajo de los que
 * viene, para poder abrirlos. Lo que llega de `GET /api/balance` → `cobrosPendientes`.
 *
 *  - `a_favor`: una devolución que espera a que la pasarela libere el pago original; todavía no está en el saldo.
 *  - `en_liberacion`: ya está en el saldo, pero se puede retirar recién desde la fecha.
 *  - `cobro_del_trabajo` (pedido del dueño, 2026-11-13): lo que cobra el trabajador de un trabajo de un solo lugar. En espera de liberación se ve con los DÍAS que faltan y el
 *    recordatorio de cuánto tarda; ya liberado, se PIDE desde la tarjeta (lo paga el equipo).
 */
export default function CobrosPendientes({ cobros, onPedirCobro }: { cobros: CobroPendiente[]; onPedirCobro?: (contractId: string) => Promise<void> }) {
  const [pidiendo, setPidiendo] = useState<string | null>(null);

  const pedir = async (contractId: string) => {
    if (!onPedirCobro || pidiendo) return;
    setPidiendo(contractId);
    try {
      await onPedirCobro(contractId);
    } finally {
      setPidiendo(null);
    }
  };

  return (
    <Transicion mostrar={cobros.length > 0} className="mb-8">
      {cobros.length > 0 && (
        <section aria-labelledby="cobros-pendientes-titulo" data-testid="cobros-pendientes">
          <h2 id="cobros-pendientes-titulo" className="text-lg font-bold text-gray-900 dark:text-white">
            Cobros pendientes
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
            Plata que ya te corresponde pero todavía no podés usar o retirar. Cada tarjeta dice de qué contrato viene y cuántos días faltan.
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cobros.map((c) => {
              const aFavor = c.tipo === 'a_favor';
              const delTrabajo = c.tipo === 'cobro_del_trabajo';
              // El cobro de un trabajo y lo que está «en liberación» dicen lo mismo: en espera (con días), liberado, o ya pedido.
              const texto = !aFavor ? textoDelCobro({ liberado: c.liberado === true, disponibleDesde: c.disponibleDesde, pedidoEl: c.pedidoEl }, new Date(), !delTrabajo) : null;
              const dias = diasQueFaltan(c.disponibleDesde);
              const liberado = delTrabajo && texto?.estado === 'Liberado';
              const pedido = delTrabajo && !!c.pedidoEl;
              return (
                <li
                  key={c.id}
                  data-testid="cobro-pendiente"
                  data-tipo={c.tipo}
                  className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">{c.etiqueta}</p>
                      <span
                        data-testid="estado-del-cobro"
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          aFavor
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : liberado || pedido
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
                        }`}
                      >
                        {liberado || pedido ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
                        {aFavor ? 'A favor pendiente' : texto?.estado}
                      </span>
                      {!aFavor && !liberado && !pedido && dias > 0 && (
                        <span data-testid="dias-que-faltan" className="ml-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                          Faltan {dias} {dias === 1 ? 'día' : 'días'}
                        </span>
                      )}
                    </div>
                    <p className="shrink-0 text-lg font-bold text-gray-900 dark:text-white">{pesos(c.monto)}</p>
                  </div>

                  {aFavor ? (
                    <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                      Todavía no es saldo: no lo podés usar ni retirar.
                      {c.disponibleDesde ? ` Pasa a tu saldo el ${fechaDeLiquidacion(c.disponibleDesde)}.` : ''}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-gray-600 dark:text-gray-400" data-testid="detalle-del-cobro">
                      {!delTrabajo && 'Ya está en tu saldo, pero todavía no lo podés retirar. '}
                      {texto?.detalle}
                    </p>
                  )}

                  {c.trabajo && (
                    <p className="mt-3 truncate text-sm text-gray-800 dark:text-gray-200" title={c.trabajo.titulo}>
                      <span className="text-gray-500 dark:text-gray-400">Trabajo: </span>
                      {c.trabajo.titulo}
                    </p>
                  )}

                  {(c.contrato || c.trabajo || (delTrabajo && texto?.puedePedir)) && (
                    <div className="mt-4 flex flex-wrap gap-2 pt-1">
                      {delTrabajo && texto?.puedePedir && c.contrato && onPedirCobro && (
                        <button
                          type="button"
                          data-testid="pedir-cobro"
                          disabled={pidiendo === c.contrato.id}
                          onClick={() => void pedir(c.contrato!.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          {pidiendo === c.contrato.id ? 'Pidiendo…' : 'Pedir el cobro'}
                        </button>
                      )}
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
