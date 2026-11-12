import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, MapPin, Star, Loader2, Users } from 'lucide-react';
import AvatarConInicial from '../components/ui/AvatarConInicial';
import { getImageUrl } from '../utils/imageUrl';
import { JOB_CATEGORIES } from '../../shared/constants/categories';
import { mostrarRating } from '../../shared/rating/display';
import { useEventoEnVivo } from '../hooks/useSocket';

/**
 * Perfiles (pedido del dueño, 2026-11-12): se buscan por nombre, rubro, perfil (trabajador o cliente), puntuación y ubicación, y se muestran como tarjetas con
 * foto, nombre, reputación y rubros. Datos de `GET /api/users/directory` (público: sin contacto ni la calle del domicilio).
 */
export interface Tarjeta {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  role: string;
  profession?: string | null;
  city?: string | null;
  state?: string | null;
  rubros: Array<{ id: string; label: string }>;
  workAnyCategory: boolean;
  workZones: Array<{ name: string; radiusKm?: number }>;
  workRadiusKm?: number | null;
  membershipTier?: string | null;
  hasMembership?: boolean | null;
}

const POR_PAGINA = 12;
const campo = 'w-full h-11 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export function TarjetaDePerfil({ u }: { u: Tarjeta }) {
  const r = mostrarRating(u.rating, u.reviewsCount);
  const lugar = [u.city, u.state].filter(Boolean).join(', ');
  const rubros = u.workAnyCategory ? [{ id: 'cualquiera', label: 'Cualquier rubro' }] : u.rubros;
  return (
    <li>
      <Link
        to={`/profile/${u.username}`}
        className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
        data-testid="tarjeta-de-perfil"
      >
        <div className="flex items-center gap-3">
          <AvatarConInicial src={u.avatar ? getImageUrl(u.avatar) : null} nombre={u.name} className="h-14 w-14 shrink-0 rounded-full text-lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
              <span className="truncate">{u.name}</span>
              {u.membershipTier === 'pro' && u.hasMembership && (
                <span className="shrink-0 rounded bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">PRO</span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{u.username}</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
              <Star className={`h-3.5 w-3.5 ${r.tieneCalificacion ? 'fill-current' : ''}`} aria-hidden="true" />
              <span>{r.texto}</span>
              {r.tieneCalificacion && <span className="text-xs text-slate-400">({u.reviewsCount})</span>}
            </p>
          </div>
        </div>
        {u.profession && <p className="text-sm text-slate-700 dark:text-slate-300">{u.profession}</p>}
        {rubros.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rubros.slice(0, 3).map((x) => (
              <span key={x.id} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">{x.label}</span>
            ))}
            {rubros.length > 3 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">+{rubros.length - 3}</span>}
          </div>
        )}
        <div className="mt-auto space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {(lugar || u.workRadiusKm) && (
            <p className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{lugar || 'Zona de trabajo'}{u.workRadiusKm ? ` · hasta ${u.workRadiusKm} km` : ''}</span>
            </p>
          )}
          {u.workZones.length > 0 && <p className="truncate pl-4">También: {u.workZones.map((z) => z.name).join(', ')}</p>}
          {u.completedJobs > 0 && <p className="pl-4">{u.completedJobs} trabajo{u.completedJobs === 1 ? '' : 's'} completado{u.completedJobs === 1 ? '' : 's'}</p>}
        </div>
      </Link>
    </li>
  );
}

export default function Profesionales() {
  const [q, setQ] = useState('');
  const [rubro, setRubro] = useState('');
  const [perfil, setPerfil] = useState<'worker' | 'client' | 'all'>('worker');
  const [minRating, setMinRating] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [lista, setLista] = useState<Tarjeta[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(async (p: number, reemplazar: boolean) => {
    const mio = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(POR_PAGINA), role: perfil });
      if (q.trim()) qs.set('q', q.trim());
      if (rubro) qs.set('rubro', rubro);
      if (minRating) qs.set('minRating', minRating);
      if (ubicacion.trim()) qs.set('location', ubicacion.trim());
      const r = await fetch(`/api/users/directory?${qs.toString()}`);
      const d = await r.json();
      if (mio !== pedido.current) return; // llegó otra búsqueda después: esta ya no vale
      if (!d.success) throw new Error(d.message || 'No se pudo cargar');
      setLista((prev) => (reemplazar ? d.users : [...prev, ...d.users]));
      setTotal(d.pagination?.total ?? d.users.length);
      setPagina(p);
    } catch {
      if (mio === pedido.current) setError('No pudimos cargar los perfiles. Probá de nuevo en un momento.');
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [q, rubro, perfil, minRating, ubicacion]);

  // Al cambiar un filtro se vuelve a buscar (con una pausa para no pedir en cada tecla).
  useEffect(() => {
    const t = setTimeout(() => void cargar(1, true), 350);
    return () => clearTimeout(t);
  }, [cargar]);
  useEventoEnVivo('socket:reconectado', () => void cargar(1, true));

  const hayMas = lista.length < total;

  return (
    <>
      <Helmet>
        <title>Perfiles - DOAPP</title>
        <meta name="description" content="Encontrá profesionales por nombre, rubro, puntuación y zona de trabajo en DOAPP." />
      </Helmet>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-3 dark:bg-sky-900/30"><Users className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Perfiles</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Buscá por nombre, rubro, puntuación o zona de trabajo.</p>
          </div>
        </header>

        <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-5" data-testid="filtros-de-perfiles">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Nombre</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o usuario" className={`${campo} pl-9`} />
          </label>
          <label>
            <span className="sr-only">Rubro</span>
            <select value={rubro} onChange={(e) => setRubro(e.target.value)} className={campo}>
              <option value="">Todos los rubros</option>
              {JOB_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Perfil</span>
            <select value={perfil} onChange={(e) => setPerfil(e.target.value as 'worker' | 'client' | 'all')} className={campo}>
              <option value="worker">Trabajadores</option>
              <option value="client">Clientes</option>
              <option value="all">Todos los perfiles</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Puntuación</span>
            <select value={minRating} onChange={(e) => setMinRating(e.target.value)} className={campo}>
              <option value="">Cualquier puntuación</option>
              <option value="3">3 estrellas o más</option>
              <option value="4">4 estrellas o más</option>
              <option value="4.5">4,5 estrellas o más</option>
            </select>
          </label>
          <label className="relative">
            <span className="sr-only">Ubicación</span>
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ciudad, provincia o zona" className={`${campo} pl-9`} />
          </label>
        </form>

        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!cargando && !error && lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400" data-testid="sin-perfiles">
            No encontramos perfiles con esos filtros. Probá con menos filtros o con otra zona.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">{total} perfil{total === 1 ? '' : 'es'}</p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lista-de-perfiles">
              {lista.map((u) => <TarjetaDePerfil key={u.id} u={u} />)}
            </ul>
          </>
        )}

        {cargando && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sky-500" aria-label="Cargando" /></div>}
        {!cargando && hayMas && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={() => void cargar(pagina + 1, false)} className="rounded-lg border border-sky-600 px-5 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800">Ver más</button>
          </div>
        )}
      </div>
    </>
  );
}
