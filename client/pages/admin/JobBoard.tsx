import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../hooks/useAuth';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

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
  por_vencer: {
    rotulo: 'Vencida sin pagar',
    ayuda: 'Superó el plazo y no está paga: se va a pausar en la próxima corrida del control.',
    clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  sin_cotizaciones: {
    rotulo: 'Sin cotizaciones',
    ayuda:
      'Lleva días publicada y nadie cotizó. Suele ser precio fuera de mercado, descripción incompleta o una categoría con pocos trabajadores.',
    clase: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
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
  'pagada_fantasma',
  'por_vencer',
  'sin_cotizaciones',
  'esperando_aprobacion',
  'pausada_inactividad',
  'normal',
];

export default function JobBoard() {
  const { token } = useAuth();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [resumen, setResumen] = useState<Record<string, number>>({});
  const [filtro, setFiltro] = useState('todos');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [umbral, setUmbral] = useState(10);

  const cargar = async (estado: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/board?estado=${estado}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
  }, [token, filtro]);

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
                  {['Estado', 'Publicación', 'Cliente', 'Precio', 'Días háb.', 'Cotiz.'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      {h}
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
