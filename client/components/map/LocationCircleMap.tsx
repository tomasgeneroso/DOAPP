import { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface LocationCircleMapProps {
  location: string;
}

export default function LocationCircleMap({ location }: LocationCircleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [lat, lng] = getApproximateCoordinates(location);

  useEffect(() => {
    if (!mapRef.current) return;

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

      // Crear mapa centrado en las coordenadas aproximadas
      const map = L.map(mapRef.current).setView([lat, lng], 13);

      // Añadir capa de mapa (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Dibujar círculo de 2km
      const circle = L.circle([lat, lng], {
        color: '#0ea5e9',
        fillColor: '#0ea5e9',
        fillOpacity: 0.2,
        radius: 2000 // 2km en metros
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
  }, [lat, lng]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Ubicación Aproximada
        </span>
      </div>
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border border-gray-300 dark:border-gray-600"
        style={{ zIndex: 0 }}
      />
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        El círculo muestra un área aproximada de 2km de radio alrededor de {location}
      </p>
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
