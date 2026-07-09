import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Crosshair, RefreshCw } from 'lucide-react';

interface LocationPinMapProps {
  address: string;
  onCoordinatesChange?: (lat: number, lng: number) => void;
  onAddressChange?: (address: string) => void;
  initialLat?: number;
  initialLng?: number;
}

// Reverse geocoding: coordinates → human address (when the user moves the pin)
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'es', 'User-Agent': 'DoApp/1.0' } }
    );
    const data = await res.json();
    return data?.display_name || null;
  } catch {
    return null;
  }
}

// Geocoding via Nominatim (OpenStreetMap, gratuito, sin API key)
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || address.trim().length < 5) return null;
  try {
    const q = encodeURIComponent(address + ', Argentina');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`,
      { headers: { 'Accept-Language': 'es', 'User-Agent': 'DoApp/1.0' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

// Buenos Aires center
const DEFAULT_LAT = -34.6037;
const DEFAULT_LNG = -58.3816;
const DEFAULT_ZOOM = 14;

export default function LocationPinMap({ address, onCoordinatesChange, onAddressChange, initialLat, initialLng }: LocationPinMapProps) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [geocoded, setGeocoded] = useState(false);

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      leafletRef.current = L.default || L;
      const Leaflet = leafletRef.current;

      // Fix default icon URLs (Webpack/Vite asset issue)
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl;
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const startLat = initialLat || DEFAULT_LAT;
      const startLng = initialLng || DEFAULT_LNG;

      const map = Leaflet.map(containerRef.current!, {
        center: [startLat, startLng],
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      });

      Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Draggable marker
      const marker = Leaflet.marker([startLat, startLng], { draggable: true }).addTo(map);
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        setCoords({ lat: pos.lat, lng: pos.lng });
        onCoordinatesChange?.(pos.lat, pos.lng);
        const addr = await reverseGeocode(pos.lat, pos.lng);
        if (addr) onAddressChange?.(addr);
      });

      // Click on map moves marker
      map.on('click', async (e: any) => {
        marker.setLatLng(e.latlng);
        setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        onCoordinatesChange?.(e.latlng.lat, e.latlng.lng);
        const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng);
        if (addr) onAddressChange?.(addr);
      });

      mapRef.current = map;
      markerRef.current = marker;

      if (initialLat && initialLng) {
        setGeocoded(true);
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geocode address when it changes
  const doGeocode = useCallback(async () => {
    if (!address || !mapRef.current) return;
    setGeocoding(true);
    const result = await geocodeAddress(address);
    setGeocoding(false);
    if (result) {
      const { lat, lng } = result;
      setCoords({ lat, lng });
      setGeocoded(true);
      mapRef.current.setView([lat, lng], 17);
      markerRef.current?.setLatLng([lat, lng]);
      onCoordinatesChange?.(lat, lng);
    }
  }, [address, onCoordinatesChange]);

  // Auto-geocode when address changes (debounced)
  useEffect(() => {
    if (!address || address.trim().length < 8) return;
    const timer = setTimeout(doGeocode, 800);
    return () => clearTimeout(timer);
  }, [address, doGeocode]);

  return (
    <div className="relative z-0 isolate rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-600">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <MapPin className="w-4 h-4 text-sky-500" />
          <span className="font-medium">Ajustá el pin en el mapa</span>
        </div>
        <div className="flex items-center gap-2">
          {coords && (
            <span className="text-[10px] text-slate-400 font-mono">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          )}
          <button
            type="button"
            onClick={doGeocode}
            disabled={geocoding || !address}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-40 transition-colors"
            title="Buscar dirección en el mapa"
          >
            {geocoding ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Crosshair className="w-3 h-3" />
            )}
            Centrar
          </button>
        </div>
      </div>

      {/* Map container */}
      <div ref={containerRef} className="w-full" style={{ height: 280 }} />

      {/* Help text */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700/60 border-t border-slate-200 dark:border-slate-600">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {geocoded
            ? 'Arrastrá el pin o hacé clic en el mapa para ajustar la ubicación exacta.'
            : 'Completá la dirección para centrar el mapa automáticamente.'}
        </p>
      </div>
    </div>
  );
}
