import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface LocationCircleMapProps {
  location: string;
}

// Cache para coordenadas geocodificadas
const geocodeCache: { [key: string]: [number, number] } = {};

export default function LocationCircleMap({ location }: LocationCircleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocodedAddress, setGeocodedAddress] = useState<string>('');

  // Geocodificar la ubicación usando Nominatim (OpenStreetMap)
  useEffect(() => {
    const geocodeLocation = async () => {
      setLoading(true);

      const cacheKey = location.toLowerCase().trim();

      // SIEMPRE verificar coordenadas predefinidas primero (tienen prioridad sobre cache)
      const predefinedCoords = getApproximateCoordinates(location);
      const isDefaultCoords = predefinedCoords[0] === -34.6037 && predefinedCoords[1] === -58.3816;
      const isBuenosAires = location.toLowerCase().includes('buenos aires') || location.toLowerCase().includes('caba');

      if (!isDefaultCoords || isBuenosAires) {
        // Es una ubicación predefinida que encontramos
        setCoordinates(predefinedCoords);
        geocodeCache[cacheKey] = predefinedCoords;
        setLoading(false);
        return;
      }

      // Solo usar cache si no hay coordenadas predefinidas
      if (geocodeCache[cacheKey]) {
        setCoordinates(geocodeCache[cacheKey]);
        setLoading(false);
        return;
      }

      // Usar Nominatim para geocodificar
      try {
        // Agregar ", Argentina" para mejorar resultados
        const searchQuery = location.includes('Argentina') ? location : `${location}, Argentina`;
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&countrycodes=ar`,
          {
            headers: {
              'Accept-Language': 'es',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            const coords: [number, number] = [lat, lon];
            setCoordinates(coords);
            setGeocodedAddress(data[0].display_name);
            geocodeCache[cacheKey] = coords;
            setLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error('Error geocoding location:', error);
      }

      // Fallback a coordenadas predefinidas
      setCoordinates(predefinedCoords);
      geocodeCache[cacheKey] = predefinedCoords;
      setLoading(false);
    };

    geocodeLocation();
  }, [location]);

  useEffect(() => {
    if (!mapRef.current || !coordinates) return;

    const [lat, lng] = coordinates;

    // Limpiar mapa anterior si existe
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Inicializar el mapa con Leaflet (OpenStreetMap)
    const loadMap = async () => {
      // @ts-ignore
      if (typeof window.L === 'undefined') {
        // Cargar Leaflet dinámicamente
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
        document.head.appendChild(script);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);

        script.onload = () => initializeMap();
      } else {
        initializeMap();
      }
    };

    const initializeMap = () => {
      // @ts-ignore
      const L = window.L;

      // Crear mapa centrado en las coordenadas
      const map = L.map(mapRef.current).setView([lat, lng], 13);
      mapInstanceRef.current = map;

      // Añadir capa de mapa (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Dibujar círculo de 1km
      const circle = L.circle([lat, lng], {
        color: '#0ea5e9',
        fillColor: '#0ea5e9',
        fillOpacity: 0.2,
        radius: 1000 // 1km en metros
      }).addTo(map);

      // Ajustar vista al círculo
      map.fitBounds(circle.getBounds(), { padding: [50, 50] });

      // Añadir ícono central
      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: '<div style="background-color: #0ea5e9; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      L.marker([lat, lng], { icon: customIcon }).addTo(map);
    };

    loadMap();

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [coordinates]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Ubicación Aproximada
        </span>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
        )}
      </div>
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border border-gray-300 dark:border-gray-600 relative"
        style={{ zIndex: 0 }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500 mx-auto" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Cargando mapa...</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        El círculo muestra un área aproximada de 1km de radio alrededor de {location}
      </p>
      {geocodedAddress && (
        <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
          Ubicación detectada: {geocodedAddress.split(',').slice(0, 3).join(', ')}
        </p>
      )}
    </div>
  );
}

// Función para obtener coordenadas aproximadas basadas en la ubicación
function getApproximateCoordinates(location: string): [number, number] {
  const locationLower = location.toLowerCase();

  // Mapa de ubicaciones principales de Argentina
  const coordinates: { [key: string]: [number, number] } = {
    // CABA
    'palermo': [-34.5889, -58.4194],
    'recoleta': [-34.5875, -58.3974],
    'belgrano': [-34.5627, -58.4570],
    'caballito': [-34.6177, -58.4369],
    'caba': [-34.6037, -58.3816],
    'microcentro': [-34.6037, -58.3816],
    'retiro': [-34.5922, -58.3744],
    'puerto madero': [-34.6070, -58.3637],

    // Buenos Aires
    'la plata': [-34.9205, -57.9536],
    'mar del plata': [-38.0055, -57.5426],
    'bahía blanca': [-38.7183, -62.2663],
    'vicente lópez': [-34.5265, -58.4782],
    'san isidro': [-34.4709, -58.5272],
    'tigre': [-34.4264, -58.5797],
    'quilmes': [-34.7202, -58.2683],
    'avellaneda': [-34.6613, -58.3655],
    'lanús': [-34.7007, -58.3905],
    'lomas de zamora': [-34.7602, -58.3984],

    // Córdoba
    'córdoba': [-31.4201, -64.1888],
    'villa carlos paz': [-31.4241, -64.4978],
    'río cuarto': [-33.1301, -64.3499],

    // Santa Fe
    'rosario': [-32.9442, -60.6505],
    'santa fe': [-31.6249, -60.6980],

    // Mendoza
    'mendoza': [-32.8895, -68.8458],

    // Tucumán
    'tucumán': [-26.8083, -65.2176],
    'san miguel de tucumán': [-26.8083, -65.2176],

    // Otras provincias
    'salta': [-24.7859, -65.4117],
    'neuquén': [-38.9516, -68.0591],
    'bariloche': [-41.1335, -71.3103],
    'ushuaia': [-54.8019, -68.3029],
    'posadas': [-27.3671, -55.8961],
    'corrientes': [-27.4692, -58.8306],
    'resistencia': [-27.4514, -58.9867],
    'formosa': [-26.1775, -58.1781],
    'san juan': [-31.5375, -68.5364],
    'san luis': [-33.3017, -66.3378],
    'la rioja': [-29.4131, -66.8558],
    'catamarca': [-28.4696, -65.7852],
    'jujuy': [-24.1858, -65.2995],
    'san salvador de jujuy': [-24.1858, -65.2995],
    'santiago del estero': [-27.7951, -64.2615],
    'santa rosa': [-36.6177, -64.2907],
    'rawson': [-43.3002, -65.1023],
    'río gallegos': [-51.6230, -69.2168],
    'viedma': [-40.8135, -62.9967],
    'paraná': [-31.7413, -60.5115],
    'concordia': [-31.3929, -58.0207],
  };

  // Buscar coincidencias
  for (const [key, coords] of Object.entries(coordinates)) {
    if (locationLower.includes(key)) {
      return coords;
    }
  }

  // Default: Buenos Aires centro
  return [-34.6037, -58.3816];
}
