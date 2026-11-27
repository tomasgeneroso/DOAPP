import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Hash, Loader2, Search } from 'lucide-react';
import Etiqueta from '../components/Etiqueta';
import InfoIcono from '../components/ui/InfoIcono';
import { getImageUrl } from '../utils/imageUrl';
import { claveDeEtiqueta, rutaDeEtiqueta } from '../../shared/etiquetas';

interface Resultado {
  etiqueta: string;
  trabajos: Array<{ id: string; titulo: string; precio: number; ubicacion: string | null }>;
  publicaciones: Array<{ id: string; titulo: string; tipo: string; imagen: string | null; autor: { id: string; name: string } | null }>;
  articulos: Array<{ id: string; titulo: string; slug: string; imagen: string | null }>;
  relacionadas: Array<{ etiqueta: string; cantidad: number }>;
}

function Seccion({ titulo, cantidad, children }: { titulo: string; cantidad: number; children: ReactNode }) {
  if (cantidad === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{titulo} <span className="text-sm font-normal text-slate-500">({cantidad})</span></h2>
      <ul className="grid gap-3 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

const TARJETA = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-sky-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-sky-700';

/** Todo lo público que lleva una etiqueta, y las etiquetas relacionadas para seguir explorando. */
export default function EtiquetaPage() {
  const { etiqueta = '' } = useParams();
  const navigate = useNavigate();
  const clave = claveDeEtiqueta(etiqueta);
  const [respuesta, setRespuesta] = useState<{ clave: string; datos: Resultado | null } | null>(null);
  const [buscada, setBuscada] = useState('');
  const datos = respuesta?.clave === clave ? respuesta.datos : undefined;

  useEffect(() => {
    let vigente = true;
    fetch(`/api/search/etiqueta/${encodeURIComponent(clave)}`)
      .then((r) => r.json())
      .then((d) => { if (vigente) setRespuesta({ clave, datos: d?.success ? d.data : null }); })
      .catch(() => { if (vigente) setRespuesta({ clave, datos: null }); });
    return () => { vigente = false; };
  }, [clave]);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (claveDeEtiqueta(buscada).length >= 2) {
      navigate(rutaDeEtiqueta(buscada));
      setBuscada('');
    }
  };
  const total = datos ? datos.trabajos.length + datos.publicaciones.length + datos.articulos.length : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Helmet>
        <title>#{clave} | DOAPP</title>
        <meta name="description" content={`Trabajos, publicaciones y artículos de DOAPP con la etiqueta ${clave}.`} />
      </Helmet>
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header className="space-y-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Hash className="h-6 w-6 text-sky-600" aria-hidden="true" />
            <span className="break-all">{clave}</span>
            <InfoIcono ayuda="Etiquetas" />
          </h1>
          <form onSubmit={buscar} className="flex gap-2" role="search">
            <label className="relative flex-1">
              <span className="sr-only">Buscar otra etiqueta</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={buscada} onChange={(e) => setBuscada(e.target.value)} placeholder="Buscar otra etiqueta, por ejemplo #pintura" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <button type="submit" className="rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">Buscar</button>
          </form>
          {datos && datos.relacionadas.length > 0 && (
            <div className="animate-fadeIn flex flex-wrap items-center gap-2" data-testid="etiquetas-relacionadas">
              <span className="text-sm text-slate-500 dark:text-slate-400">Relacionadas:</span>
              {datos.relacionadas.map((r) => <Etiqueta key={r.etiqueta} etiqueta={r.etiqueta} />)}
            </div>
          )}
        </header>

        {datos === undefined && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-label="Cargando" /></div>}
        {datos === null && <p role="alert" className="py-12 text-center text-slate-600 dark:text-slate-400">No pudimos buscar esa etiqueta. Probá de nuevo en un momento.</p>}
        {datos && total === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Lo que se publique con #{clave} va a aparecer acá.
          </p>
        )}
        {datos && (
          <div className="animate-fadeIn space-y-6">
            <Seccion titulo="Trabajos abiertos" cantidad={datos.trabajos.length}>
              {datos.trabajos.map((t) => (
                <li key={t.id}><Link to={`/jobs/${t.id}`} className={TARJETA}>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900 dark:text-white">{t.titulo}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{t.ubicacion}</span></span>
                  {t.precio > 0 && <span className="shrink-0 text-sm font-semibold text-green-600 dark:text-green-400">${t.precio.toLocaleString('es-AR')}</span>}
                </Link></li>
              ))}
            </Seccion>
            <Seccion titulo="Publicaciones" cantidad={datos.publicaciones.length}>
              {datos.publicaciones.map((p) => (
                <li key={p.id}><Link to={`/posts/${p.id}`} className={TARJETA}>
                  {p.imagen && <img src={getImageUrl(p.imagen)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900 dark:text-white">{p.titulo}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{p.tipo === 'article' ? 'Artículo' : 'Publicación'}{p.autor ? ` · ${p.autor.name}` : ''}</span></span>
                </Link></li>
              ))}
            </Seccion>
            <Seccion titulo="Artículos del blog" cantidad={datos.articulos.length}>
              {datos.articulos.map((a) => (
                <li key={a.id}><Link to={`/blog/${a.slug}`} className={TARJETA}>
                  {a.imagen && <img src={getImageUrl(a.imagen)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-white">{a.titulo}</span>
                </Link></li>
              ))}
            </Seccion>
          </div>
        )}
      </div>
    </div>
  );
}
