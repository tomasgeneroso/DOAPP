import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Hexagon, Loader2, Plus, Undo2, Trash2 } from 'lucide-react';
import {
  MAXIMO_DE_AREAS_EN_MAPA,
  MAXIMO_DE_VERTICES,
  RADIO_MAXIMO_EN_MAPA_KM,
  sanearArea,
  type AreaEnMapa,
} from '../../../shared/perfiles/zonaDeTrabajo';

/**
 * Marcar en un mapa la zona donde se trabaja (pedido del dueño, 2026-11-19): un RADIO (se toca el centro y se elige cuántos km) o un POLÍGONO (se tocan los vértices, en orden).
 * Las zonas ya guardadas se dibujan en verde; la que se está marcando, en celeste. Leaflet se carga recién al abrir el mapa (no pesa en el resto de la pantalla).
 * Es un componente controlado por `onAgregar`: no guarda nada, devuelve la forma y el nombre y Configuración la guarda con el resto del perfil.
 */
interface Props {
  /** Dónde centrar el mapa al abrirlo (el domicilio, si se conoce). */
  centroInicial?: { lat: number; lng: number } | null;
  /** Las formas que la persona ya tiene guardadas (se dibujan de fondo). */
  guardadas: Array<{ name: string; area: AreaEnMapa }>;
  /** Para centrar el mapa cuando la persona busca un lugar arriba. */
  irA?: { lat: number; lng: number; clave: number } | null;
  alAgregar: (nombre: string, area: AreaEnMapa) => void;
  llena: boolean;
}

const ARGENTINA: [number, number] = [-34.6037, -58.3816];

export default function MapaDeZonas({ centroInicial, guardadas, irA, alAgregar, llena }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const L = useRef<any>(null);
  const mapa = useRef<any>(null);
  const capaGuardadas = useRef<any>(null);
  const capaNueva = useRef<any>(null);
  const [listo, setListo] = useState(false);
  const [modo, setModo] = useState<'radio' | 'poligono'>('radio');
  const modoActual = useRef(modo);
  const [centro, setCentro] = useState<[number, number] | null>(null);
  const [km, setKm] = useState(5);
  const [puntos, setPuntos] = useState<Array<[number, number]>>([]);
  const [nombre, setNombre] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  modoActual.current = modo;

  // Se crea el mapa una sola vez.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const leaflet: any = (await import('leaflet')).default ?? (await import('leaflet'));
      await import('leaflet/dist/leaflet.css');
      if (!vivo || !contenedor.current) return;
      L.current = leaflet;
      const m = leaflet.map(contenedor.current, { scrollWheelZoom: false }).setView(centroInicial ? [centroInicial.lat, centroInicial.lng] : ARGENTINA, centroInicial ? 11 : 5);
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(m);
      capaGuardadas.current = leaflet.layerGroup().addTo(m);
      capaNueva.current = leaflet.layerGroup().addTo(m);
      m.on('click', (e: any) => {
        const p: [number, number] = [Math.round(e.latlng.lat * 1000) / 1000, Math.round(e.latlng.lng * 1000) / 1000];
        if (modoActual.current === 'radio') setCentro(p);
        else setPuntos((prev) => (prev.length >= MAXIMO_DE_VERTICES ? prev : [...prev, p]));
      });
      mapa.current = m;
      setListo(true);
    })();
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa se crea una vez; el centro inicial solo importa al abrirlo
  }, []);

  // «Ir a» un lugar buscado arriba.
  useEffect(() => {
    if (listo && irA && mapa.current) mapa.current.setView([irA.lat, irA.lng], 12);
  }, [listo, irA]);

  // Las zonas guardadas, de fondo.
  useEffect(() => {
    if (!listo || !L.current) return;
    capaGuardadas.current.clearLayers();
    for (const g of guardadas) {
      const estilo = { color: '#059669', weight: 2, fillOpacity: 0.12 };
      const capa = g.area.tipo === 'radio' ? L.current.circle([g.area.lat, g.area.lng], { ...estilo, radius: g.area.radiusKm * 1000 }) : L.current.polygon(g.area.puntos, estilo);
      capa.bindTooltip(g.name).addTo(capaGuardadas.current);
    }
  }, [listo, guardadas]);

  // Lo que se está marcando ahora.
  useEffect(() => {
    if (!listo || !L.current) return;
    capaNueva.current.clearLayers();
    const estilo = { color: '#0284c7', weight: 3, fillOpacity: 0.2 };
    if (modo === 'radio' && centro) {
      L.current.circle(centro, { ...estilo, radius: km * 1000 }).addTo(capaNueva.current);
      L.current.circleMarker(centro, { radius: 5, color: '#0284c7', fillOpacity: 1 }).addTo(capaNueva.current);
    }
    if (modo === 'poligono' && puntos.length > 0) {
      if (puntos.length >= 3) L.current.polygon(puntos, estilo).addTo(capaNueva.current);
      else L.current.polyline(puntos, estilo).addTo(capaNueva.current);
      puntos.forEach((p) => L.current.circleMarker(p, { radius: 5, color: '#0284c7', fillOpacity: 1 }).addTo(capaNueva.current));
    }
  }, [listo, modo, centro, km, puntos]);

  const area: AreaEnMapa | null =
    modo === 'radio' ? (centro ? sanearArea({ tipo: 'radio', lat: centro[0], lng: centro[1], radiusKm: km }) : null) : puntos.length >= 3 ? sanearArea({ tipo: 'poligono', puntos }) : null;

  const agregar = useCallback(() => {
    if (!area) {
      setAviso(modo === 'radio' ? 'Tocá el mapa para marcar el centro.' : puntos.length < 3 ? 'Marcá al menos 3 puntos para cerrar la zona.' : 'La zona es demasiado grande: marcala más chica.');
      return;
    }
    const n = nombre.replace(/\s+/g, ' ').trim() || `Zona ${guardadas.length + 1} en el mapa`;
    alAgregar(n.slice(0, 80), area);
    setNombre('');
    setCentro(null);
    setPuntos([]);
    setAviso(null);
  }, [area, modo, puntos.length, nombre, guardadas.length, alAgregar]);

  const cambiarModo = (m: 'radio' | 'poligono') => {
    setModo(m);
    setAviso(null);
  };

  return (
    <div className="space-y-3" data-testid="mapa-de-zonas">
      <div role="group" aria-label="Cómo marcar la zona" className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cambiarModo('radio')}
          aria-pressed={modo === 'radio'}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${modo === 'radio' ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}
        >
          <Circle className="h-4 w-4" aria-hidden="true" /> Radio
        </button>
        <button
          type="button"
          onClick={() => cambiarModo('poligono')}
          aria-pressed={modo === 'poligono'}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${modo === 'poligono' ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}
        >
          <Hexagon className="h-4 w-4" aria-hidden="true" /> Polígono
        </button>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400">
        {modo === 'radio'
          ? 'Tocá el mapa para marcar el centro y elegí hasta dónde llegás.'
          : `Tocá el mapa para ir marcando los puntos del borde de tu zona (hasta ${MAXIMO_DE_VERTICES}). Con 3 o más puntos queda cerrada.`}
      </p>

      <div className="relative">
        <div ref={contenedor} className="z-0 h-72 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" role="application" aria-label="Mapa para marcar tu zona de trabajo" />
        {!listo && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-50/80 dark:bg-slate-800/80">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" aria-label="Cargando el mapa" />
          </div>
        )}
      </div>

      {modo === 'radio' ? (
        <div>
          <label htmlFor="radioDelMapa" className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
            <span>Radio</span>
            <span className="font-semibold">{km} km</span>
          </label>
          <input id="radioDelMapa" type="range" min={1} max={RADIO_MAXIMO_EN_MAPA_KM} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full accent-sky-600" />
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setPuntos((p) => p.slice(0, -1))} disabled={puntos.length === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">
            <Undo2 className="h-4 w-4" aria-hidden="true" /> Deshacer punto
          </button>
          <button type="button" onClick={() => setPuntos([])} disabled={puntos.length === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Borrar todo
          </button>
          <span className="self-center text-xs text-slate-500">{puntos.length} {puntos.length === 1 ? 'punto' : 'puntos'}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={nombre}
          maxLength={80}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de esta zona (opcional)"
          aria-label="Nombre de esta zona"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white"
        />
        <button
          type="button"
          onClick={agregar}
          disabled={llena}
          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar esta zona
        </button>
      </div>
      {llena && <p className="text-xs text-amber-700 dark:text-amber-300">Llegaste al máximo de {MAXIMO_DE_AREAS_EN_MAPA} zonas marcadas en el mapa. Quitá una para sumar otra.</p>}
      {aviso && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{aviso}</p>}
    </div>
  );
}
