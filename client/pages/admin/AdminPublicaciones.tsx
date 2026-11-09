import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2 } from 'lucide-react';
import PanelGeneralDePublicaciones from './PanelGeneralDePublicaciones';

const JobBoard = lazy(() => import('./JobBoard'));
const JobManager = lazy(() => import('./JobManager'));

/**
 * Publicaciones: UN solo lugar en el menú (antes eran «Publicaciones» y «Panel de publicaciones», más Contratos y Pagos por separado para seguir una publicación).
 *
 *  - «Vista general»: una fila por publicación con su estado final, su contrato y su pago, buscable por cualquier ID vinculado.
 *  - «Para atender»: las publicaciones trabadas y por qué (el panel de siempre).
 *  - «Moderación»: aprobar, rechazar y editar publicaciones (el listado de siempre).
 * Las direcciones viejas siguen andando: `/admin/jobs?search=<id>` abre la vista general ya buscando eso, y `/admin/jobs/board` lleva a «Para atender».
 */
const VISTAS = [
  { clave: 'general', rotulo: 'Vista general' },
  { clave: 'atender', rotulo: 'Para atender' },
  { clave: 'moderacion', rotulo: 'Moderación' },
] as const;

export default function AdminPublicaciones() {
  const [parametros, setParametros] = useSearchParams();
  const pedida = parametros.get('vista');
  const vista = VISTAS.some((v) => v.clave === pedida) ? (pedida as (typeof VISTAS)[number]['clave']) : 'general';

  const elegir = (clave: string) => {
    const siguiente = new URLSearchParams(parametros);
    if (clave === 'general') siguiente.delete('vista');
    else siguiente.set('vista', clave);
    // Cada vista tiene su propia búsqueda: la de la vista general no se arrastra a las otras.
    siguiente.delete('q');
    siguiente.delete('search');
    siguiente.delete('id');
    setParametros(siguiente);
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Publicaciones · Administración</title></Helmet>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Publicaciones</h1>
        <div role="tablist" aria-label="Vistas de publicaciones" className="mt-3 flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              role="tab"
              type="button"
              aria-selected={vista === v.clave}
              onClick={() => elegir(v.clave)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                vista === v.clave
                  ? 'border-sky-500 text-sky-700 dark:text-sky-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
      </div>

      {vista === 'general' && <PanelGeneralDePublicaciones />}
      {vista === 'atender' && (
        <Suspense fallback={<div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-500" aria-label="Cargando" /></div>}>
          <JobBoard />
        </Suspense>
      )}
      {vista === 'moderacion' && (
        <Suspense fallback={<div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-500" aria-label="Cargando" /></div>}>
          <JobManager />
        </Suspense>
      )}
    </div>
  );
}
