import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, AlertTriangle, Upload, CheckCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Transicion from "../ui/Transicion";
import type { DesgloseDelPago, OpcionDeDevolucion, ClaveDeDevolucion } from '../../../shared/pagos/opcionesDeDevolucion';

/**
 * Devolver dinero de un pago.
 *
 * Vive como componente propio y no dentro de la pantalla de pagos porque el
 * mismo flujo hace falta en varios lugares -- resolver una disputa, cancelar un
 * trabajo, conceder un contracargo -- y tener tres copias de una pantalla que
 * mueve plata es cómo terminan divergiendo.
 *
 * El principio de todo lo que hay acá: el que aprieta el botón tiene que ver
 * exactamente cuánto sale y a dónde va, antes de apretarlo. Una devolución no
 * se deshace.
 *
 * Pedido del dueño, 2026-11-20: las partes del pago a la vista (precio, comisión, procesamiento, IVA), lo ya devuelto separado en «por Mercado Pago» y «al saldo del
 * cliente», las opciones de cancelación ya calculadas (a tiempo / con trabajador o fuera de plazo), devolución total y monto personalizado, y el COMPROBANTE primero:
 * no se puede devolver hasta subirlo.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama cuando la devolución salió bien, para que la pantalla recargue. */
  onListo?: () => void;
  pago: {
    id: string;
    amount: number;
    currency?: string;
    refundedAmount?: number;
    payerName?: string;
    description?: string;
  } | null;
}

interface Info {
  total: number;
  devueltoPorMercadoPago: number;
  acreditadoAlSaldo: number;
  movimientosAlSaldo: Array<{ id: string; amount: number; status: string; description?: string; createdAt?: string; origen?: string }>;
  disponible: number;
  sobreacreditado: boolean;
  desglose: DesgloseDelPago;
  opciones: OpcionDeDevolucion[];
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RefundModal({ abierto, onCerrar, onListo, pago }: Props) {
  const { token } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [cargando, setCargando] = useState(false);
  const [opcion, setOpcion] = useState<ClaveDeDevolucion | null>(null);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [esFinal, setEsFinal] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState<{ url: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verMovimientos, setVerMovimientos] = useState(false);

  const cargarInfo = useCallback(async () => {
    if (!pago) return;
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/payments/${pago.id}/refund-info`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setInfo(d.data);
      else setError(d.message || 'No se pudo leer el estado de las devoluciones de este pago.');
    } catch {
      setError('No se pudo leer el estado de las devoluciones de este pago.');
    } finally {
      setCargando(false);
    }
  }, [pago, token]);

  // Se limpia al abrir. Sin esto, el motivo escrito para una devolución anterior
  // queda cargado en la siguiente, y ese texto es el que después explica el
  // movimiento en el registro.
  useEffect(() => {
    if (abierto) {
      setInfo(null);
      setOpcion(null);
      setMonto('');
      setMotivo('');
      setEsFinal(false);
      setArchivo(null);
      setReferencia('');
      setComprobante(null);
      setError(null);
      setVerMovimientos(false);
      void cargarInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pago?.id]);

  if (!abierto || !pago) return null;

  const elegida = info?.opciones.find((o) => o.clave === opcion) ?? null;
  const disponible = info?.disponible ?? 0;
  const importe = elegida?.clave === 'personalizado' ? Number(monto) : elegida?.monto ?? 0;
  const montoInvalido = elegida?.clave === 'personalizado' && monto.trim() !== '' && (!(importe > 0) || importe > disponible || Number.isNaN(importe));
  const falta = !elegida ? 'Elegí qué devolver' : elegida.clave === 'personalizado' && !(importe > 0) ? 'Escribí el monto' : !comprobante ? 'Subí el comprobante' : motivo.trim().length < 10 ? 'Contá el motivo' : null;
  const cierra = elegida ? (elegida.clave === 'personalizado' ? esFinal : elegida.cierraElPago) : false;

  const subirComprobante = async () => {
    if (!archivo || subiendo) return;
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', archivo);
      const r = await fetch('/api/admin/payments/upload-proof', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!d.success || !d.url) {
        setError(d.message || 'No se pudo subir el comprobante.');
        return;
      }
      setComprobante({ url: d.url, nombre: d.originalName || archivo.name });
    } catch {
      setError('Error de red al subir el comprobante.');
    } finally {
      setSubiendo(false);
    }
  };

  const devolver = async () => {
    if (falta || montoInvalido || !elegida || !comprobante) return;

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${pago.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          opcion: elegida.clave,
          // Total y las opciones de cancelación las calcula el servidor con la fila bloqueada: el número de esta pantalla solo vale para «personalizado».
          monto: elegida.clave === 'personalizado' ? importe : undefined,
          motivo: motivo.trim(),
          esFinal: elegida.clave === 'personalizado' ? esFinal : undefined,
          comprobanteUrl: comprobante.url,
          referencia: referencia.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        // El 403 de doble confirmación no es un error del usuario: es el
        // control pidiendo 2FA. Se dice así y no como "falló".
        // Todo mensaje que se muestra pasa por un respaldo. Un `undefined`
        // interpolado en un cartel de error es peor que un mensaje genérico:
        // le dice al usuario que algo se rompió sin decirle qué.
        const detalle = data.message || 'No se pudo procesar la devolución';
        setError(
          data.requiereVerificacion
            ? `${detalle} Confirmá tu identidad y volvé a intentar.`
            : detalle,
        );
        return;
      }

      onListo?.();
      onCerrar();
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setEnviando(false);
    }
  };

  const d = info?.desglose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" data-testid="devolver-dinero">
      <div className="my-auto w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Devolver dinero</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {pago.description || 'Pago'}
              {pago.payerName && <> · {pago.payerName}</>}
            </p>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {cargando && !info && (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo el pago…</p>
          )}

          {info && d && (
            <>
              {/* Las partes del pago: sin saber de qué está hecho el total, cualquier monto es a ciegas. */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm" data-testid="partes-del-pago">
                <div className="flex justify-between px-3 py-2"><span className="text-slate-600 dark:text-slate-400">Precio del trabajo</span><span className="font-medium text-slate-900 dark:text-white">{pesos(d.precio)}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-slate-600 dark:text-slate-400">Comisión de DOAPP {d.comision === 0 && <span className="text-xs text-emerald-600">(no hay)</span>}</span><span className="font-medium text-slate-900 dark:text-white">{pesos(d.comision)}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-slate-600 dark:text-slate-400">IVA de la comisión</span><span className="font-medium text-slate-900 dark:text-white">{pesos(d.ivaComision)}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-slate-600 dark:text-slate-400">Procesamiento (pasarela){d.estimado && <span className="text-xs text-amber-600"> · estimado</span>}</span><span className="font-medium text-slate-900 dark:text-white">{pesos(d.procesamiento)}</span></div>
                <div className="flex justify-between px-3 py-2"><span className="text-slate-600 dark:text-slate-400">IVA del procesamiento</span><span className="font-medium text-slate-900 dark:text-white">{pesos(d.ivaProcesamiento)}</span></div>
                <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40"><span className="font-semibold text-slate-900 dark:text-white">Cobrado al cliente</span><span className="font-semibold text-slate-900 dark:text-white">{pesos(info.total)}</span></div>
              </div>

              {/* Lo ya devuelto, separado por camino: así «$20.000 de $10.560,99» deja de ser un misterio. */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm" data-testid="ya-devuelto">
                <div className="flex justify-between px-3 py-2"><span className="text-slate-600 dark:text-slate-400">Ya devuelto por Mercado Pago</span><span className="font-medium text-amber-700 dark:text-amber-400">−{pesos(info.devueltoPorMercadoPago)}</span></div>
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-600 dark:text-slate-400">
                    Ya acreditado al saldo del cliente
                    {info.movimientosAlSaldo.length > 0 && (
                      <button type="button" onClick={() => setVerMovimientos((v) => !v)} className="ml-2 text-xs text-sky-600 underline dark:text-sky-400" aria-expanded={verMovimientos}>
                        {verMovimientos ? 'ocultar' : `ver ${info.movimientosAlSaldo.length} movimiento${info.movimientosAlSaldo.length === 1 ? '' : 's'}`}
                      </button>
                    )}
                  </span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">−{pesos(info.acreditadoAlSaldo)}</span>
                </div>
                <Transicion mostrar={verMovimientos}>
                  <ul className="space-y-1 px-3 py-2 text-xs text-slate-600 dark:text-slate-300" data-testid="movimientos-al-saldo">
                    {info.movimientosAlSaldo.map((m) => (
                      <li key={m.id} className="flex justify-between gap-3">
                        <span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-AR') : ''} · {m.description || m.origen || 'Acreditación al saldo'}{m.status === 'pending' ? ' (pendiente)' : ''}</span>
                        <span className="whitespace-nowrap">{pesos(Number(m.amount))}</span>
                      </li>
                    ))}
                  </ul>
                </Transicion>
                <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40"><span className="font-semibold text-slate-900 dark:text-white">Se puede devolver hasta</span><span className="font-semibold text-slate-900 dark:text-white" data-testid="se-puede-devolver">{pesos(info.disponible)}</span></div>
              </div>

              {info.sobreacreditado && (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100" role="alert" data-testid="aviso-sobreacreditado">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Lo devuelto y acreditado ({pesos(info.devueltoPorMercadoPago + info.acreditadoAlSaldo)}) es más de lo que se cobró ({pesos(info.total)}). Puede haber una acreditación duplicada al saldo del cliente: mirá los movimientos de arriba y corregilo con «ajustar saldo» antes de devolver por Mercado Pago.
                  </span>
                </div>
              )}

              {/* Qué devolver */}
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Qué devolver</legend>
                <div className="space-y-2">
                  {info.opciones.map((o) => (
                    <label
                      key={o.clave}
                      className={`flex gap-3 items-start rounded-lg border p-3 ${o.disponible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${opcion === o.clave ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                    >
                      <input type="radio" name="opcion-de-devolucion" checked={opcion === o.clave} disabled={!o.disponible} onChange={() => setOpcion(o.clave)} className="mt-1" data-testid={`opcion-${o.clave}`} />
                      <span className="flex-1 text-sm">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="font-medium text-slate-900 dark:text-white">{o.titulo}</span>
                          {o.monto !== null && <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{pesos(o.monto)}</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{o.disponible ? o.detalle : o.motivoNoDisponible}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {opcion === 'personalizado' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="monto-a-devolver">Monto a devolver</label>
                  <input
                    id="monto-a-devolver"
                    type="number"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder={`Hasta ${pesos(disponible)}`}
                    min={0}
                    max={disponible}
                    className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white ${montoInvalido ? 'border-rose-400 dark:border-rose-600' : 'border-slate-300 dark:border-slate-600'}`}
                  />
                  {montoInvalido && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">Tiene que estar entre $1 y {pesos(disponible)}.</p>}
                  {importe > 0 && importe < disponible && !montoInvalido && (
                    <label className="mt-3 flex gap-3 items-start rounded-lg border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
                      <input type="checkbox" checked={esFinal} onChange={(e) => setEsFinal(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-sky-600" />
                      <span className="text-sm">
                        <span className="font-medium text-slate-900 dark:text-white">Cerrar el pago con esta devolución</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Van a quedar {pesos(disponible - importe)} sin devolver, retenidos a propósito. Marcado, no se van a poder devolver después.
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* El comprobante va primero: sin él no se devuelve. */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3" data-testid="comprobante-de-devolucion">
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Comprobante de la devolución <span className="text-rose-600">*</span></p>
                {comprobante ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400" data-testid="comprobante-subido">
                    <CheckCircle className="h-4 w-4" /> {comprobante.nombre}
                    <button type="button" onClick={() => { setComprobante(null); setArchivo(null); }} className="ml-2 text-xs text-slate-500 underline">cambiar</button>
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      aria-label="Archivo del comprobante"
                      onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                      className="block min-w-0 flex-1 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 dark:text-slate-200 dark:file:bg-slate-600"
                    />
                    <button
                      type="button"
                      onClick={subirComprobante}
                      disabled={!archivo || subiendo}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="subir-comprobante-de-devolucion"
                    >
                      {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir
                    </button>
                  </div>
                )}
                <label className="mb-1 mt-3 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="referencia-de-devolucion">N° de operación o de reembolso (opcional)</label>
                <input id="referencia-de-devolucion" type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Es el archivo que respalda la devolución (la captura del reembolso en Mercado Pago o el comprobante del banco). Queda guardado en el pago.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="motivo-de-devolucion">Por qué se devuelve</label>
                <textarea
                  id="motivo-de-devolucion"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ej: se canceló el trabajo antes de contratar"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Es lo que va a explicar este movimiento dentro de seis meses. Mínimo diez caracteres.</p>
              </div>

              {elegida && cierra && elegida.clave !== 'personalizado' && (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                  Esta devolución cierra el pago: {pesos(Math.max(0, disponible - importe))} quedan retenidos a propósito (procesamiento{info.desglose.comision > 0 && elegida.clave === 'cancelacion_con_trabajador' ? ' y comisión' : ''}) y no se van a poder devolver después.
                </p>
              )}
            </>
          )}

          <Transicion mostrar={!!error}>
          {error && (
            <div className="flex gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          </Transicion>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 p-5">
          {/* El monto final, grande y a la izquierda. Es el único número que
              importa en el momento de apretar. */}
          <div className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">Se devuelven </span>
            <span className="font-bold text-lg text-slate-900 dark:text-white" data-testid="se-devuelven">{pesos(montoInvalido || !elegida ? 0 : importe)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button
              onClick={devolver}
              disabled={enviando || montoInvalido || !!falta}
              title={falta || undefined}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="confirmar-devolucion"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Devolver
            </button>
          </div>
        </div>
        {falta && info && <p className="px-5 pb-4 text-right text-xs text-slate-500 dark:text-slate-400" data-testid="falta-para-devolver">{falta} para poder devolver.</p>}
      </div>
    </div>
  );
}
