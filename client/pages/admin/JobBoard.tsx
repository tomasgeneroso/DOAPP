import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../hooks/useAuth';
import { Loader2, RefreshCw, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

/**
 * Panel operativo de publicaciones.
 *
 * No reemplaza al listado de trabajos: ése sirve para buscar uno y editarlo.
 * Éste responde otra pregunta, que es la que se hace todos los días quien
 * atiende la plataforma: cuál publicación está trabada y por qué.
 *
 * Por eso ordena por antigüedad y no por fecha de creación descendente. Lo que
 * importa está arriba de todo: lo más viejo que sigue sin resolverse.
 */

interface Fila {
  id: string;
  titulo: string;
  estado: string;
  estadoBase: string;
  precio: number;
  modo: string;
  pagada: boolean;
  diasHabiles: number;
  cotizaciones: number;
  cotizacionesAceptadas: number;
  publicadaEl: string;
  cancelacionPedidaEl?: string | null;
  motivoCancelacion?: string | null;
  cliente: { id: string; nombre: string; email: string } | null;
}

/**
 * Cada estado dice qué hacer, no sólo qué pasa.
 *
 * El orden importa: es el orden en que conviene atacarlos. "Pagada fantasma"
 * va primero porque es el único donde hay plata inmovilizada de alguien que
 * confió lo suficiente como para pagar por adelantado.
 */
const ESTADOS: Record<string, { rotulo: string; ayuda: string; clase: string }> = {
  cancelacion_pendiente: {
    rotulo: 'Pidió cancelar',
    ayuda:
      'El cliente pidió cancelar mientras la publicación esperaba aprobación. Salió de la cola de aprobar. Si aprobás la cancelación se le acredita a su saldo todo lo que pagó menos la pasarela (T&C 9.1). Es el único caso donde la comisión se devuelve, por eso pasa por una persona.',
    clase: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  },
  pagada_fantasma: {
    rotulo: 'Pagada fantasma',
    ayuda:
      'El cliente pagó y la publicación superó el plazo sin aceptar ninguna cotización. No se pausa —pagar compra permanencia— pero nadie la está atendiendo, y el trabajador que cotiza sobre ella pierde el tiempo igual. Conviene llamar al cliente.',
    clase: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  },
  pausada_inactividad: {
    rotulo: 'Pausada por inactividad',
    ayuda: 'Se pausó sola por superar el plazo sin cotización aceptada. El cliente puede reanudarla.',
    clase: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  },
  vencida_sin_elegir: {
    rotulo: 'Vencida: el cliente no eligió',
    ayuda:
      'Superó el plazo y SÍ recibió cotizaciones, pero el cliente no aceptó ninguna. El cuello de botella es el cliente: hay que llamarlo a él. Se va a pausar en la próxima corrida.',
    clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  vencida_nadie_cotizo: {
    rotulo: 'Vencida: nadie cotizó',
    ayuda:
      'Superó el plazo y nunca recibió una sola cotización. El problema está en la publicación, no en el cliente: precio fuera de mercado, descripción incompleta o una categoría sin trabajadores. Se va a pausar en la próxima corrida.',
    clase: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  },
  sin_cotizaciones: {
    rotulo: 'Sin cotizaciones (a tiempo)',
    ayuda:
      'Todavía está dentro del plazo, pero lleva varios días sin una sola cotización. Es el aviso temprano: se puede corregir el precio o el texto antes de que venza.',
    clase: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
  },
  esperando_aprobacion: {
    rotulo: 'Esperando aprobación',
    ayuda: 'Todavía no la aprobó un administrador, así que no es visible para nadie.',
    clase: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  },
  normal: {
    rotulo: 'En curso',
    ayuda: 'Sin nada para hacer.',
    clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
};

const ORDEN = [
  'cancelacion_pendiente',
  'pagada_fantasma',
  'vencida_sin_elegir',
  'vencida_nadie_cotizo',
  'sin_cotizaciones',
  'esperando_aprobacion',
  'pausada_inactividad',
  'normal',
];

/** Columnas por las que se puede ordenar. La clave es la del dato en la fila. */
const COLUMNAS: Array<{ clave: string; rotulo: string; ordenable: boolean }> = [
  { clave: 'estado', rotulo: 'Estado', ordenable: true },
  { clave: 'titulo', rotulo: 'Publicación', ordenable: true },
  { clave: 'cliente', rotulo: 'Cliente', ordenable: false },
  { clave: 'precio', rotulo: 'Precio', ordenable: true },
  { clave: 'diasHabiles', rotulo: 'Días háb.', ordenable: true },
  { clave: 'cotizaciones', rotulo: 'Cotiz.', ordenable: true },
];

export default function JobBoard() {
  const { token } = useAuth();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [resumen, setResumen] = useState<Record<string, number>>({});
  const [filtro, setFiltro] = useState('todos');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [umbral, setUmbral] = useState(10);
  // Arranca por días hábiles descendente: lo más viejo sin resolver, primero.
  const [ordenarPor, setOrdenarPor] = useState('diasHabiles');
  const [direccion, setDireccion] = useState<'asc' | 'desc'>('desc');
  const [accionando, setAccionando] = useState<string | null>(null);

  /**
   * Aprobar el pedido de cancelación del cliente. El servidor liquida
   * (todo menos pasarela, T&C 9.1) y le avisa al cliente con su número.
   */
  const aprobarCancelacion = async (f: Fila) => {
    if (!window.confirm(`Aprobar la cancelación de "${f.titulo}" y devolverle al cliente todo lo que pagó menos la pasarela?`)) return;
    setAccionando(f.id);
    try {
      const res = await fetch(`/api/admin/jobs/${f.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo aprobar la cancelación');
      const liq = data.liquidacion;
      if (liq) {
        window.alert(`Cancelación aprobada. Al cliente se le acreditaron $${Number(liq.aCliente).toLocaleString('es-AR')}; la pasarela se quedó $${Number(liq.costoPasarela).toLocaleString('es-AR')}.`);
      }
      setFilas((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e: any) {
      setError(e?.message || 'Error');
    } finally {
      setAccionando(null);
    }
  };

  /**
   * Un clic ordena por esa columna; el segundo invierte.
   *
   * Cambiar de columna arranca siempre en descendente y no conserva la
   * dirección anterior: en este panel lo interesante es el extremo alto de
   * cualquier columna -- lo más viejo, lo más caro, lo que más cotizaciones
   * tiene -- así que ése es el primer clic.
   */
  const ordenar = (clave: string) => {
    if (ordenarPor === clave) {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenarPor(clave);
      setDireccion('desc');
    }
  };

  const cargar = async (estado: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/jobs/board?estado=${estado}&ordenarPor=${ordenarPor}&direccion=${direccion}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'No se pudo cargar el panel');
      setFilas(data.data || []);
      setResumen(data.resumen || {});
      setUmbral(data.umbralDiasHabiles || 10);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (token) cargar(filtro);
  }, [token, filtro, ordenarPor, direccion]);

  const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;

  return (
    <>
      <Helmet>
        <title>Panel de publicaciones - DOAPP</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Panel de publicaciones
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Ordenadas por antigüedad: lo más viejo sin resolver, primero. El plazo de control es
              de {umbral} días hábiles sin cotización aceptada.
            </p>
          </div>
          <button
            onClick={() => cargar(filtro)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {/* Contadores: son también el filtro. Un panel donde hay que elegir el
            filtro en un desplegable aparte esconde justamente el número que
            uno vino a mirar. */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltro('todos')}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              filtro === 'todos'
                ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Todas{' '}
            <span className="font-semibold">
              {Object.values(resumen).reduce((a, b) => a + b, 0)}
            </span>
          </button>
          {ORDEN.filter((e) => resumen[e]).map((e) => (
            <button
              key={e}
              onClick={() => setFiltro(e)}
              title={ESTADOS[e].ayuda}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                filtro === e
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {ESTADOS[e].rotulo} <span className="font-semibold">{resumen[e]}</span>
            </button>
          ))}
        </div>

        {/* La explicación del estado filtrado va a la vista, no en un tooltip:
            quien mira este panel puede no ser quien definió las reglas. */}
        {filtro !== 'todos' && ESTADOS[filtro] && (
          <div className="flex gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <AlertTriangle className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 dark:text-slate-300">{ESTADOS[filtro].ayuda}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {cargando ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : filas.length === 0 ? (
          <p className="text-center py-16 text-slate-500 dark:text-slate-400">
            No hay publicaciones en este estado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {COLUMNAS.map((c) => (
                    <th
                      key={c.clave}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      {c.ordenable ? (
                        <button
                          onClick={() => ordenar(c.clave)}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
                          // El estado del orden va en aria-sort además del ícono:
                          // un lector de pantalla no ve la flechita.
                          aria-label={`Ordenar por ${c.rotulo}`}
                        >
                          {c.rotulo}
                          {ordenarPor === c.clave ? (
                            direccion === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </button>
                      ) : (
                        c.rotulo
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {filas.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <span
                        title={ESTADOS[f.estado]?.ayuda}
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          ESTADOS[f.estado]?.clase || ''
                        }`}
                      >
                        {ESTADOS[f.estado]?.rotulo || f.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/jobs/${f.id}`}
                        className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {f.titulo}
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {f.modo === 'quote' ? 'A cotizar' : 'Precio fijo'}
                        {f.pagada && ' · pagada'}
                      </p>
                      {f.estado === 'cancelacion_pendiente' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {f.motivoCancelacion && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{f.motivoCancelacion}"</p>
                          )}
                          <button
                            type="button"
                            disabled={accionando === f.id}
                            onClick={() => aprobarCancelacion(f)}
                            className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {accionando === f.id ? 'Devolviendo…' : 'Aprobar cancelación y devolver saldo'}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {f.cliente?.nombre || '—'}
                      <p className="text-xs text-slate-400">{f.cliente?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-white whitespace-nowrap">
                      {f.precio > 0 ? pesos(f.precio) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {f.diasHabiles}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {f.cotizaciones}
                      {f.cotizacionesAceptadas > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {' '}
                          ({f.cotizacionesAceptadas} acept.)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
