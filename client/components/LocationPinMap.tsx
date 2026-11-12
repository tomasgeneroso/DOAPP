import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Crosshair, RefreshCw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { hayQueUbicar, ubicarDireccion, type EntradaDeUbicacion } from '../../shared/geo/ubicar';

/**
 * Mapa con un pin que SIGUE a la dirección (regla del dueño, 2026-11-11: «el pin tiene que estar constantemente actualizándose»).
 *
 *  - Cada vez que cambia la calle, el número, la ubicación, la provincia o la localidad, el pin se va a ese lugar (con una pausa de 0,7 s para no buscar en cada tecla).
 *  - Si el formulario ya trae las coordenadas exactas (se eligió una dirección de la lista), el pin va ahí y NO se vuelve a buscar por el texto.
 *  - Arrastrar el pin o tocar el mapa lo coloca a mano: se avisa con `onPinMovedByUser` y por unos segundos no se lo vuelve a mover (los datos que el formulario completa
 *    a partir del nuevo punto no pueden arrastrar el pin de vuelta).
 */
interface LocationPinMapProps extends EntradaDeUbicacion {
  /** Posición del pin (controlada): cuando cambia, el pin y el mapa se mueven ahí. */
  lat?: number | null;
  lng?: number | null;
  /** Cada vez que el pin cambia de lugar (buscado por el texto o puesto a mano). */
  onCoordinatesChange?: (lat: number, lng: number) => void;
  /** Solo cuando la persona lo arrastra o toca el mapa (para completar barrio, código postal y localidad). */
  onPinMovedByUser?: (lat: number, lng: number) => void;
}

// Buenos Aires: solo es donde arranca el mapa si todavía no hay nada.
const DEFAULT_LAT = -34.6037;
const DEFAULT_LNG = -58.3816;
const DEFAULT_ZOOM = 14;
const PAUSA_MS = 700;
/** Después de colocar el pin a mano, los cambios de dirección que vienen de ahí no lo mueven. */
const GRACIA_TRAS_MOVERLO_MS = 4000;
const MISMO_PUNTO = 1e-6;

const claveDe = (e: EntradaDeUbicacion): string => [e.calle, e.numero, e.lugar, e.provincia, e.ciudad].map((x) => String(x ?? '').trim()).join('|');
const numeroValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export default function LocationPinMap({ calle, numero, lugar, provincia, ciudad, lat, lng, onCoordinatesChange, onPinMovedByUser }: LocationPinMapProps) {
  const { t } = useTranslation();
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapaListo, setMapaListo] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(numeroValido(lat) && numeroValido(lng) ? { lat, lng } : null);
  const [buscando, setBuscando] = useState(false);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [ubicado, setUbicado] = useState(numeroValido(lat) && numeroValido(lng));

  // Los últimos valores, para los manejadores del mapa (que se crean una sola vez).
  const alCambiar = useRef(onCoordinatesChange);
  const alMoverla = useRef(onPinMovedByUser);
  const entrada = useRef<EntradaDeUbicacion>({ calle, numero, lugar, provincia, ciudad });
  useEffect(() => {
    alCambiar.current = onCoordinatesChange;
    alMoverla.current = onPinMovedByUser;
    entrada.current = { calle, numero, lugar, provincia, ciudad };
  });
  const controlRef = useRef<AbortController | null>(null);
  const claveActual = claveDe({ calle, numero, lugar, provincia, ciudad });
  /** La dirección (como texto) para la que ya hay coordenadas exactas: no se la vuelve a buscar. */
  const resuelta = useRef<string | null>(numeroValido(lat) && numeroValido(lng) ? claveActual : null);
  const noMoverHasta = useRef(0);
  const inicial = useRef({ lat, lng });

  const moverA = (la: number, lo: number, zoom: number) => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;
    marker.setLatLng([la, lo]);
    map.setView([la, lo], zoom);
    setCoords({ lat: la, lng: lo });
    setUbicado(true);
  };

  // Crea el mapa (una sola vez).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelado = false;

    import('leaflet').then((L) => {
      if (cancelado || !containerRef.current || mapRef.current) return;
      const Leaflet: any = (L as any).default || L;

      // Fix default icon URLs (Webpack/Vite asset issue)
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl;
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const startLat = numeroValido(inicial.current.lat) ? inicial.current.lat : DEFAULT_LAT;
      const startLng = numeroValido(inicial.current.lng) ? inicial.current.lng : DEFAULT_LNG;
      const map = Leaflet.map(containerRef.current, { center: [startLat, startLng], zoom: numeroValido(inicial.current.lat) ? 17 : DEFAULT_ZOOM, zoomControl: true });
      Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = Leaflet.marker([startLat, startLng], { draggable: true }).addTo(map);
      const colocadoAMano = (la: number, lo: number) => {
        noMoverHasta.current = Date.now() + GRACIA_TRAS_MOVERLO_MS;
        resuelta.current = null;
        setCoords({ lat: la, lng: lo });
        setUbicado(true);
        setNoEncontrada(false);
        alCambiar.current?.(la, lo);
        alMoverla.current?.(la, lo);
      };
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        colocadoAMano(pos.lat, pos.lng);
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        colocadoAMano(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setMapaListo(true);
    });

    return () => {
      cancelado = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // El formulario trae coordenadas exactas (se eligió una dirección de la lista, o se cargó un borrador): el pin va ahí y esa dirección ya está resuelta.
  useEffect(() => {
    if (!mapaListo || !numeroValido(lat) || !numeroValido(lng)) return;
    const pos = markerRef.current?.getLatLng();
    resuelta.current = claveActual;
    if (pos && Math.abs(pos.lat - lat) < MISMO_PUNTO && Math.abs(pos.lng - lng) < MISMO_PUNTO) return; // ya está ahí (lo puso la propia persona)
    moverA(lat, lng, 17);
    setNoEncontrada(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, mapaListo]);

  // La dirección cambió: se busca de nuevo (con una pausa) y el pin se va ahí.
  const buscarAhora = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    buscarAhora.current = async () => {
      const e = entrada.current;
      if (!mapRef.current || !hayQueUbicar(e)) return;
      setBuscando(true);
      controlRef.current?.abort();
      const control = new AbortController();
      controlRef.current = control;
      const punto = await ubicarDireccion(e, { signal: control.signal });
      if (control.signal.aborted) return;
      setBuscando(false);
      if (!punto) {
        setNoEncontrada(true);
        return;
      }
      setNoEncontrada(false);
      resuelta.current = claveDe(e);
      moverA(punto.lat, punto.lon, punto.zoom);
      alCambiar.current?.(punto.lat, punto.lon);
    };
  });

  useEffect(() => {
    if (!mapaListo) return;
    // Ya hay coordenadas exactas para esta dirección, o la persona acaba de colocar el pin a mano: no se la busca por el texto.
    if (resuelta.current === claveActual) return;
    if (Date.now() < noMoverHasta.current) return;
    if (!hayQueUbicar({ calle, numero, lugar })) return;
    const timer = setTimeout(() => {
      if (resuelta.current === claveDe(entrada.current) || Date.now() < noMoverHasta.current) return;
      void buscarAhora.current();
    }, PAUSA_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActual, mapaListo]);

  useEffect(() => () => controlRef.current?.abort(), []);

  const hayDireccion = hayQueUbicar({ calle, numero, lugar });
  return (
    <div className="relative z-0 isolate rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-600">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <MapPin className="w-4 h-4 text-sky-500" />
          <span className="font-medium">{t('map.adjustPin', 'Ajustá el pin en el mapa')}</span>
        </div>
        <div className="flex items-center gap-2">
          {coords && (
            <span className="text-[10px] text-slate-400 font-mono">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          )}
          <button
            type="button"
            onClick={() => { noMoverHasta.current = 0; resuelta.current = null; void buscarAhora.current(); }}
            disabled={buscando || !hayDireccion}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-40 transition-colors"
            title="Buscar dirección en el mapa"
          >
            {buscando ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
            Centrar
          </button>
        </div>
      </div>

      {/* Map container */}
      <div ref={containerRef} className="w-full" style={{ height: 280 }} />

      {/* Help text */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700/60 border-t border-slate-200 dark:border-slate-600">
        <p className={`text-[11px] ${noEncontrada ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`} aria-live="polite">
          {buscando
            ? 'Buscando la dirección en el mapa…'
            : noEncontrada
              ? 'No encontramos esa dirección: arrastrá el pin o hacé clic en el mapa para ponerlo donde va.'
              : ubicado
                ? 'El pin sigue a la dirección que escribís. Arrastralo o hacé clic en el mapa para ajustar la ubicación exacta.'
                : 'Completá la dirección para centrar el mapa automáticamente.'}
        </p>
      </div>
    </div>
  );
}
