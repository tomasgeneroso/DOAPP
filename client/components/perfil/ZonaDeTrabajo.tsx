import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Map as MapIcon, MapPin, Plus, X } from 'lucide-react';
import { RADIOS_DE_TRABAJO_KM, MAXIMO_DE_ZONAS, MAXIMO_DE_AREAS_EN_MAPA, type AreaEnMapa } from '../../../shared/perfiles/zonaDeTrabajo';
import { buscarLugares, type LugarSugerido } from '../../../shared/geo/lugares';
import MapaDeZonas from './MapaDeZonas';

/**
 * Zona de trabajo (pedido del dueño, 2026-11-12 y 2026-11-19): el domicilio fija la zona base; además se puede elegir un radio en km desde el domicilio, sumar otras zonas
 * escribiendo un barrio o una ciudad (SUGIERE lugares reales mientras se escribe) y marcar la zona en un mapa con un radio o un polígono. Controlado: Configuración guarda
 * los valores junto con el resto del perfil.
 */
export interface Zona {
  name: string;
  radiusKm?: number;
  /** Si se marcó en el mapa: su forma. */
  area?: AreaEnMapa;
}

interface Props {
  ciudad: string;
  provincia: string;
  radioKm: number | null;
  onRadio: (r: number | null) => void;
  zonas: Zona[];
  onZonas: (z: Zona[]) => void;
  /** El domicilio en el mapa, si se conoce: el mapa se abre ahí. */
  centroInicial?: { lat: number; lng: number } | null;
}

/** Lo que se guarda como nombre de la zona (corto, para que coincida con la ubicación de los trabajos) y lo que se muestra en la lista. */
function nombreDeLaZona(l: LugarSugerido): string {
  return (l.barrio || l.ciudad || l.etiqueta.split(',')[0] || '').trim();
}
function etiquetaDeLaZona(l: LugarSugerido): string {
  return [l.barrio, l.ciudad, l.provincia].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || l.etiqueta;
}

export default function ZonaDeTrabajo({ ciudad, provincia, radioKm, onRadio, zonas, onZonas, centroInicial }: Props) {
  const [nueva, setNueva] = useState('');
  const [sugerencias, setSugerencias] = useState<LugarSugerido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const [irA, setIrA] = useState<{ lat: number; lng: number; clave: number } | null>(null);
  const idLista = useId();
  const caja = useRef<HTMLDivElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const control = useRef<AbortController | null>(null);
  const base = [ciudad, provincia].filter(Boolean).join(', ');
  const zonasEnMapa = zonas.filter((z): z is Zona & { area: AreaEnMapa } => !!z.area);

  // Sugiere lugares reales (barrios y ciudades) mientras se escribe, sin pedir en cada letra.
  useEffect(() => {
    if (espera.current) clearTimeout(espera.current);
    control.current?.abort();
    const texto = nueva.replace(/\s+/g, ' ').trim();
    if (texto.length < 3) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    espera.current = setTimeout(async () => {
      const c = new AbortController();
      control.current = c;
      try {
        const lugares = await buscarLugares(texto, { signal: c.signal });
        // Zonas, no direcciones exactas: sin repetir el mismo nombre.
        const vistos = new Set<string>();
        const unicos = lugares.filter((l) => {
          const n = nombreDeLaZona(l).toLowerCase();
          if (!n || vistos.has(n)) return false;
          vistos.add(n);
          return true;
        });
        if (!c.signal.aborted) {
          setSugerencias(unicos);
          setAbierta(unicos.length > 0);
          setActiva(-1);
        }
      } catch {
        if (!c.signal.aborted) setSugerencias([]);
      } finally {
        if (!c.signal.aborted) setBuscando(false);
      }
    }, 350);
    return () => {
      if (espera.current) clearTimeout(espera.current);
      control.current?.abort();
    };
  }, [nueva]);

  // Tocar afuera cierra la lista.
  useEffect(() => {
    const alTocar = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('pointerdown', alTocar);
    return () => document.removeEventListener('pointerdown', alTocar);
  }, []);

  const sumar = (name: string) => {
    const limpio = name.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (limpio.length < 2 || zonas.length >= MAXIMO_DE_ZONAS) return;
    if (zonas.some((z) => z.name.toLowerCase() === limpio.toLowerCase())) return;
    onZonas([...zonas, { name: limpio }]);
  };

  const agregar = () => {
    sumar(nueva);
    setNueva('');
    setSugerencias([]);
    setAbierta(false);
  };

  const elegir = (l: LugarSugerido) => {
    sumar(nombreDeLaZona(l));
    setIrA({ lat: l.lat, lng: l.lon, clave: Date.now() });
    setNueva('');
    setSugerencias([]);
    setAbierta(false);
  };

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700" data-testid="zona-de-trabajo">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Zona de trabajo
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Tu domicilio define tu zona base{base ? <>: <strong>{base}</strong></> : '. Completá la ciudad arriba para que se vea'}. Sumá un radio, otras zonas donde también trabajás o marcá tu zona en el mapa.
        </p>
      </div>

      <div>
        <label htmlFor="radioDeTrabajo" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Radio de trabajo desde tu domicilio
        </label>
        <select
          id="radioDeTrabajo"
          value={radioKm ?? ''}
          onChange={(e) => onRadio(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white"
        >
          <option value="">Sin definir</option>
          {RADIOS_DE_TRABAJO_KM.map((km) => (
            <option key={km} value={km}>Hasta {km} km</option>
          ))}
        </select>
      </div>

      <div ref={caja}>
        <label htmlFor="otraZona" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Otras zonas donde trabajás</label>
        <div className="relative flex gap-2">
          <div className="relative w-full">
            <input
              id="otraZona"
              type="text"
              role="combobox"
              aria-expanded={abierta}
              aria-controls={idLista}
              aria-autocomplete="list"
              autoComplete="off"
              value={nueva}
              maxLength={80}
              onChange={(e) => setNueva(e.target.value)}
              onFocus={() => sugerencias.length > 0 && setAbierta(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && sugerencias.length > 0) {
                  e.preventDefault();
                  setAbierta(true);
                  setActiva((a) => Math.min(a + 1, sugerencias.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiva((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Escape') {
                  setAbierta(false);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (abierta && activa >= 0 && sugerencias[activa]) elegir(sugerencias[activa]);
                  else agregar();
                }
              }}
              placeholder="Ej.: Palermo, Zona Norte, Rosario"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pr-9 text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white"
            />
            {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
            {abierta && sugerencias.length > 0 && (
              <ul id={idLista} role="listbox" aria-label="Zonas sugeridas" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
                {sugerencias.map((l, i) => (
                  <li key={`${l.lat}-${l.lon}-${i}`} role="option" aria-selected={i === activa}>
                    <button
                      type="button"
                      onClick={() => elegir(l)}
                      onMouseEnter={() => setActiva(i)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === activa ? 'bg-sky-50 dark:bg-slate-700' : ''}`}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 dark:text-white">{nombreDeLaZona(l)}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{etiquetaDeLaZona(l)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={agregar}
            disabled={nueva.trim().length < 2 || zonas.length >= MAXIMO_DE_ZONAS}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escribí al menos 3 letras y te sugerimos barrios y ciudades.</p>

        {zonas.length > 0 && (
          <ul className="mt-3 space-y-2">
            {zonas.map((z, i) => (
              <li key={`${z.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                {z.area ? <MapIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-white">
                  {z.name}
                  {z.area && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      {z.area.tipo === 'radio' ? `En el mapa · radio ${z.area.radiusKm} km` : `En el mapa · polígono de ${z.area.puntos.length} puntos`}
                    </span>
                  )}
                </span>
                {!z.area && (
                  <select
                    aria-label={`Radio alrededor de ${z.name}`}
                    value={z.radiusKm ?? ''}
                    onChange={(e) => onZonas(zonas.map((x, j) => (j === i ? { name: x.name, ...(e.target.value ? { radiusKm: Number(e.target.value) } : {}) } : x)))}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  >
                    <option value="">Sin radio</option>
                    {RADIOS_DE_TRABAJO_KM.map((km) => (
                      <option key={km} value={km}>{km} km</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => onZonas(zonas.filter((_, j) => j !== i))} aria-label={`Quitar ${z.name}`} className="text-slate-400 hover:text-red-500">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMapaAbierto((v) => !v)}
          aria-expanded={mapaAbierto}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200"
        >
          <MapIcon className="h-4 w-4" aria-hidden="true" />
          {mapaAbierto ? 'Ocultar el mapa' : 'Marcar mi zona en el mapa'}
        </button>
        {mapaAbierto && (
          <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <MapaDeZonas
              centroInicial={centroInicial}
              guardadas={zonasEnMapa.map((z) => ({ name: z.name, area: z.area }))}
              irA={irA}
              llena={zonasEnMapa.length >= MAXIMO_DE_AREAS_EN_MAPA || zonas.length >= MAXIMO_DE_ZONAS}
              alAgregar={(nombre, area) => {
                if (zonas.length >= MAXIMO_DE_ZONAS) return;
                // un nombre repetido se numera, para no pisar otra zona
                let n = nombre;
                let k = 2;
                while (zonas.some((z) => z.name.toLowerCase() === n.toLowerCase())) n = `${nombre} (${k++})`;
                onZonas([...zonas, { name: n, area }]);
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
