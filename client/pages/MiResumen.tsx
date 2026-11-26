import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Share2 } from 'lucide-react';
import { textoDelResumen, type ResumenAnual } from '../../shared/momentos/momentos';
import { compartirTexto, pedirMomentos } from '../components/momentos/api';

/** «Un año trabajando por mi cuenta»: privado. La persona decide si lo comparte, y el texto no nombra clientes, montos ni direcciones. */
export default function MiResumen() {
  const [r, setR] = useState<ResumenAnual | null>(null);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  useEffect(() => {
    void pedirMomentos<ResumenAnual>('/resumen-anual').then((x) => (x.ok && x.data?.rubros ? setR(x.data) : setError(x.message || 'No pudimos armar tu resumen.')));
  }, []);

  const CAJA = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4';
  const APAGADO = 'text-slate-500 dark:text-slate-400';
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Esto construiste este año</h1>
        <p className={`mt-1 flex items-center gap-1.5 text-sm ${APAGADO}`}><Lock className="h-4 w-4" aria-hidden="true" />Solo lo ves vos. Cuenta los últimos 12 meses.</p>
      </header>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!r && !error && <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>}
      {r && r.trabajosTerminados === 0 && (
        <div className={CAJA}>
          <p className="text-slate-700 dark:text-slate-200">Tu resumen empieza con tu primer trabajo terminado.</p>
          <Link to="/" className="mt-3 inline-block rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white">Ver trabajos disponibles</Link>
        </div>
      )}
      {r && r.trabajosTerminados > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={CAJA}>
              <p className={`text-sm ${APAGADO}`}>Trabajos terminados</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">{r.trabajosTerminados}</p>
            </div>
            <div className={CAJA}>
              <p className={`text-sm ${APAGADO}`}>Puntuación media</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">{r.calificacionMedia === null ? '—' : r.calificacionMedia.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</p>
              <p className={`text-xs ${APAGADO}`}>{r.resenas} {r.resenas === 1 ? 'reseña' : 'reseñas'}</p>
            </div>
          </div>
          <div className={CAJA}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">En qué trabajaste</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {r.rubros.map((x) => <li key={x.rubro} className="flex justify-between gap-3"><span>{x.rubro}</span><span>{x.cantidad}</span></li>)}
            </ul>
          </div>
          <div className={CAJA}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Si querés compartirlo</h2>
            <p data-testid="texto-del-resumen" className="mt-2 text-sm italic text-slate-600 dark:text-slate-300">«{textoDelResumen(r)}»</p>
            <button type="button" onClick={async () => { const x = await compartirTexto(textoDelResumen(r)); setHecho(x === 'copiado' ? 'Copiado.' : x === 'compartido' ? 'Compartido.' : ''); }} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">
              <Share2 className="h-4 w-4" aria-hidden="true" />Compartir
            </button>
            <span role="status" className={`ml-2 text-sm ${APAGADO}`}>{hecho}</span>
          </div>
        </>
      )}
    </div>
  );
}
