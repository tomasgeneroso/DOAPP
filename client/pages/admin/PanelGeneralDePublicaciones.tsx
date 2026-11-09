import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCambiosDeAdministracion } from '../../hooks/useSocket';
import { AlertTriangle, ExternalLink, FileText, Loader2, Receipt, Search, X } from 'lucide-react';
import Transicion from '../../components/ui/Transicion';
import IdBadge from '../../components/admin/IdBadge';
import { ESTADOS_FINALES, type TonoDeEstado } from '../../../shared/admin/resumenDePublicacion';

/**
 * Publicaciones, vista general: UNA fila por publicación con su ESTADO FINAL, su CONTRATO y su PAGO (el dibujo del dueño, 2026-11-09).
 *
 * En vez de una lista por cada cosa (publicaciones, contratos, pagos…) se mira esta y desde cada fila se llega al resto. Se busca con CUALQUIER id vinculado —de la
 * publicación, del pago, del contrato, del cliente, del trabajador, del retiro, de la propuesta…—, con un pedazo de id (el principio o el final), con el título
 * o con un nombre; y cada resultado dice POR QUÉ apareció. Qué dice cada rótulo y cómo se llega de un id a una publicación: shared/admin/resumenDePublicacion.ts
 * y server/services/vinculosDeId.ts.
 */

interface Fila {
  id: string;
  titulo: string;
  precio: number;
  estadoDelTrabajo: string;
  creadaEl: string;
  cliente: { id: string; nombre: string } | null;
  trabajadores: Array<{ id: string; nombre: string }>;
  estadoFinal: { clave: string; rotulo: string };
  contrato: { clave: string; rotulo: string; cantidad: number; terminados: number; contratoId: string | null };
  pago: { clave: string; rotulo: string; detalle: string | null; pagoId: string | null };
  alerta: string | null;
  coincide: string[];
}

const TONOS: Record<TonoDeEstado, string> = {
  atender: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  espera: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  marcha: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  fin: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelada: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
const tonoDe = (clave: string): TonoDeEstado => ESTADOS_FINALES.find((e) => e.clave === clave)?.tono ?? 'espera';

/** El contrato y el pago se pintan por su propia clave: lo bueno en verde, lo que falta en ámbar, lo que está mal en rojo. */
const COLOR_DE_CONTRATO: Record<string, string> = {
  en_disputa: TONOS.atender, sin_contrato: TONOS.cancelada, cancelado: TONOS.cancelada, terminado: TONOS.fin, en_proceso: TONOS.marcha, por_empezar: TONOS.marcha, esperando_confirmacion: TONOS.marcha,
};
const COLOR_DE_PAGO: Record<string, string> = {
  sin_pagar: TONOS.espera, en_revision: TONOS.espera, verificado: TONOS.fin, rechazado: TONOS.atender, devuelto: TONOS.cancelada, falta_pagar_trabajador: TONOS.atender, pagado_trabajador: TONOS.fin,
};

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export default function PanelGeneralDePublicaciones() {
  const { token } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const inicial = parametros.get('q') || parametros.get('search') || parametros.get('id') || '';
  const [texto, setTexto] = useState(inicial);
  const [q, setQ] = useState(inicial);
  const [estado, setEstado] = useState('todas');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [resumen, setResumen] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pedidoActual = useRef(0);

  // La búsqueda se manda al servidor un momento después de que termina de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 350);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useCallback(async () => {
    const mio = ++pedidoActual.current;
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (estado !== 'todas') params.set('estado', estado);
      const res = await fetch(`/api/admin/jobs/panel?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (mio !== pedidoActual.current) return; // llegó tarde: ya se pidió otra cosa
      if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cargar el panel');
      setFilas(data.data || []);
      setResumen(data.resumen || {});
      setError(null);
    } catch (e: any) {
      if (mio === pedidoActual.current) setError(e?.message || 'No se pudo cargar el panel');
    } finally {
      if (mio === pedidoActual.current) setCargando(false);
    }
  }, [q, estado, token]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);

  // Un pago, un contrato, una publicación o un retiro que cambia (lo haga quien lo haga) se ve al instante.
  useCambiosDeAdministracion(['payment', 'contract', 'job', 'withdrawal', 'dispute'], () => void cargar());

  // La búsqueda queda en la dirección: se puede compartir o volver a ella.
  useEffect(() => {
    const siguiente = new URLSearchParams(parametros);
    siguiente.delete('search');
    siguiente.delete('id');
    if (q) siguiente.set('q', q);
    else siguiente.delete('q');
    if (siguiente.toString() !== parametros.toString()) setParametros(siguiente, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const total = Object.values(resumen).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Una fila por publicación: su estado final, su contrato y su pago. Buscá con el ID de la publicación, del pago, del contrato, del cliente, del trabajador, del
          retiro o de la propuesta (entero, o un pedazo del principio o del final), con el título o con un nombre.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por cualquier ID (publicación, pago, contrato, persona, retiro…) o por nombre"
          aria-label="Buscar publicaciones por cualquier ID vinculado"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-10 text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        {texto && (
          <button type="button" onClick={() => setTexto('')} aria-label="Borrar la búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado final">
        <button
          type="button"
          onClick={() => setEstado('todas')}
          aria-pressed={estado === 'todas'}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${estado === 'todas' ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'}`}
        >
          Todas{total ? ` (${total})` : ''}
        </button>
        {ESTADOS_FINALES.filter((e) => resumen[e.clave]).map((e) => (
          <button
            key={e.clave}
            type="button"
            onClick={() => setEstado(estado === e.clave ? 'todas' : e.clave)}
            aria-pressed={estado === e.clave}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${estado === e.clave ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            {e.rotulo} ({resumen[e.clave]})
          </button>
        ))}
      </div>

      <Transicion mostrar={!!error}>
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>
      </Transicion>

      <div className="overflow-x-auto rounded-lg bg-white shadow dark:bg-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">Publicación</th>
              <th scope="col" className="px-4 py-3">Cliente → Trabajador</th>
              <th scope="col" className="px-4 py-3">Estado final</th>
              <th scope="col" className="px-4 py-3">Contrato</th>
              <th scope="col" className="px-4 py-3">Pago</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Ir a</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {cargando && filas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Cargando" /></td></tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                  {q ? `Ninguna publicación está vinculada a «${q}».` : 'No hay publicaciones.'}
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{f.titulo}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <IdBadge id={f.id} />
                      <span>{pesos(f.precio)} · {fecha(f.creadaEl)}</span>
                    </div>
                    {f.coincide.length > 0 && (
                      <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">Coincide: {f.coincide.join(' · ')}</p>
                    )}
                    {f.alerta && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {f.alerta}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    <div>{f.cliente?.nombre ?? 'Sin cliente'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{f.trabajadores.length ? f.trabajadores.map((t) => t.nombre).join(', ') : 'Sin trabajador'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${TONOS[tonoDe(f.estadoFinal.clave)]}`}>{f.estadoFinal.rotulo}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${COLOR_DE_CONTRATO[f.contrato.clave] ?? TONOS.espera}`}>{f.contrato.rotulo}</span>
                    {f.contrato.cantidad > 1 && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.contrato.terminados} de {f.contrato.cantidad} terminados</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${COLOR_DE_PAGO[f.pago.clave] ?? TONOS.espera}`}>{f.pago.rotulo}</span>
                    {f.pago.detalle && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.pago.detalle}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link to={`/admin/jobs/${f.id}/expediente`} title="Expediente: todo lo de esta publicación y su plata" aria-label={`Abrir el expediente de ${f.titulo}`} className="rounded p-1.5 text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20">
                        <FileText className="h-4 w-4" />
                      </Link>
                      <Link to={`/jobs/${f.id}`} title="Ver la publicación" aria-label={`Ver la publicación ${f.titulo}`} className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      {f.contrato.contratoId && (
                        <Link to={`/admin/contracts?search=${f.contrato.contratoId}`} title="Abrir el contrato en Gestión de contratos" aria-label="Abrir el contrato en Gestión de contratos" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                          <FileText className="h-4 w-4" />
                        </Link>
                      )}
                      {f.pago.pagoId && (
                        <Link to={`/admin/pending-payments?search=${f.pago.pagoId}`} title="Abrir el pago en Pagos" aria-label="Abrir el pago en Pagos" className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                          <Receipt className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
