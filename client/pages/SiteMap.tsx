import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MapPin, Loader2, Briefcase, Calendar, DollarSign, Filter, X } from 'lucide-react';
import type { Job } from '@/types';

// Cache para coordenadas geocodificadas
const geocodeCache: { [key: string]: [number, number] } = {};

// Función para obtener coordenadas aproximadas basadas en la ubicación
function getApproximateCoordinates(location: string): [number, number] {
  const locationLower = location.toLowerCase();

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
    'buenos aires': [-34.6037, -58.3816],

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

  for (const [key, coords] of Object.entries(coordinates)) {
    if (locationLower.includes(key)) {
      return coords;
    }
  }

  return [-34.6037, -58.3816]; // Default: Buenos Aires
}

// Geocodificar ubicación usando Nominatim
async function geocodeLocation(location: string): Promise<[number, number]> {
  const cacheKey = location.toLowerCase().trim();

  // Verificar coordenadas predefinidas primero
  const predefinedCoords = getApproximateCoordinates(location);
  const isDefaultCoords = predefinedCoords[0] === -34.6037 && predefinedCoords[1] === -58.3816;
  const isBuenosAires = location.toLowerCase().includes('buenos aires') || location.toLowerCase().includes('caba');

  if (!isDefaultCoords || isBuenosAires) {
    geocodeCache[cacheKey] = predefinedCoords;
    return predefinedCoords;
  }

  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }

  try {
    const searchQuery = location.includes('Argentina') ? location : `${location}, Argentina`;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&countrycodes=ar`,
      { headers: { 'Accept-Language': 'es' } }
    );

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const coords: [number, number] = [lat, lon];
        geocodeCache[cacheKey] = coords;
        return coords;
      }
    }
  } catch (error) {
    console.error('Error geocoding location:', error);
  }

  geocodeCache[cacheKey] = predefinedCoords;
  return predefinedCoords;
}

interface JobWithCoords extends Job {
  coordinates?: [number, number];
}

export default function SiteMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [jobs, setJobs] = useState<JobWithCoords[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobWithCoords | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const markersRef = useRef<any[]>([]);

  // Fetch all jobs
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/jobs?status=open&limit=500');
        const data = await response.json();

        if (data.success && data.jobs) {
          // Geocodificar todas las ubicaciones
          const jobsWithCoords: JobWithCoords[] = await Promise.all(
            data.jobs.map(async (job: Job) => {
              if (job.location) {
                const coords = await geocodeLocation(job.location);
                // Agregar pequeño offset aleatorio para evitar superposición
                const offset = () => (Math.random() - 0.5) * 0.01;
                return { ...job, coordinates: [coords[0] + offset(), coords[1] + offset()] as [number, number] };
              }
              return job;
            })
          );

          setJobs(jobsWithCoords);
        }
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || loading) return;

    const loadMap = async () => {
      // @ts-expect-error - Leaflet is loaded dynamically
      if (typeof window.L === 'undefined') {
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

        // Agregar CSS para clusters
        const clusterLink = document.createElement('link');
        clusterLink.rel = 'stylesheet';
        clusterLink.href = 'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css';
        document.head.appendChild(clusterLink);

        const clusterDefaultLink = document.createElement('link');
        clusterDefaultLink.rel = 'stylesheet';
        clusterDefaultLink.href = 'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css';
        document.head.appendChild(clusterDefaultLink);

        script.onload = () => {
          // Cargar plugin de clusters
          const clusterScript = document.createElement('script');
          clusterScript.src = 'https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js';
          document.head.appendChild(clusterScript);
          clusterScript.onload = () => initializeMap();
        };
      } else {
        initializeMap();
      }
    };

    const initializeMap = () => {
      // @ts-expect-error - Leaflet is loaded dynamically
      const L = window.L;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Crear mapa centrado en Argentina
      const map = L.map(mapRef.current).setView([-38.4161, -63.6167], 4);
      mapInstanceRef.current = map;

      // Añadir capa de mapa
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      setMapLoading(false);
      updateMarkers();
    };

    loadMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading]);

  // Update markers when jobs or filter changes
  const updateMarkers = () => {
    if (!mapInstanceRef.current) return;

    // @ts-expect-error - Leaflet is loaded dynamically
    const L = window.L;
    const map = mapInstanceRef.current;

    // Limpiar marcadores anteriores
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Filtrar trabajos
    const filteredJobs = categoryFilter === 'all'
      ? jobs
      : jobs.filter(job => job.category === categoryFilter);

    // Crear grupo de clusters si está disponible
    const markerClusterGroup = L.markerClusterGroup ? L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
    }) : null;

    const bounds: [number, number][] = [];

    filteredJobs.forEach((job) => {
      if (!job.coordinates) return;

      bounds.push(job.coordinates);

      // Crear ícono personalizado
      const customIcon = L.divIcon({
        className: 'custom-job-marker',
        html: `
          <div style="
            background-color: #0ea5e9;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      const marker = L.marker(job.coordinates, { icon: customIcon });

      // Popup content
      const popupContent = `
        <div style="min-width: 200px; padding: 8px;">
          <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1e293b;">
            ${job.title}
          </h3>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
            ${job.location}
          </p>
          <p style="font-weight: 600; color: #0ea5e9; font-size: 14px; margin-bottom: 8px;">
            $${job.price?.toLocaleString('es-AR')} ARS
          </p>
          <a href="/jobs/${job.id}" style="
            display: inline-block;
            background-color: #0ea5e9;
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 12px;
            font-weight: 500;
          ">
            Ver trabajo
          </a>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        setSelectedJob(job);
      });

      if (markerClusterGroup) {
        markerClusterGroup.addLayer(marker);
      } else {
        marker.addTo(map);
        markersRef.current.push(marker);
      }
    });

    if (markerClusterGroup) {
      map.addLayer(markerClusterGroup);
      markersRef.current.push(markerClusterGroup);
    }

    // Ajustar vista a los marcadores
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  };

  useEffect(() => {
    if (!mapLoading && jobs.length > 0) {
      updateMarkers();
    }
  }, [jobs, categoryFilter, mapLoading]);

  // Get unique categories
  const categories = [...new Set(jobs.map(job => job.category).filter(Boolean))];

  return (
    <>
      <Helmet>
        <title>Mapa de Trabajos - DoApp</title>
        <meta name="description" content="Explora todos los trabajos disponibles en Argentina en nuestro mapa interactivo" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="container mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="h-6 w-6 text-sky-500" />
                  Mapa de Trabajos
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  {loading ? 'Cargando trabajos...' : `${jobs.length} trabajos disponibles en Argentina`}
                </p>
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
          {(loading || mapLoading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 z-10">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-sky-500 mx-auto" />
                <p className="mt-4 text-slate-600 dark:text-slate-400">
                  {loading ? 'Cargando trabajos...' : 'Preparando mapa...'}
                </p>
              </div>
            </div>
          )}

          <div
            ref={mapRef}
            className="w-full h-full"
            style={{ zIndex: 0 }}
          />

          {/* Selected Job Card */}
          {selectedJob && (
            <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 z-20">
              <button
                onClick={() => setSelectedJob(null)}
                className="absolute top-2 right-2 p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>

              <h3 className="font-bold text-slate-900 dark:text-white pr-6 mb-2">
                {selectedJob.title}
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <MapPin className="h-4 w-4" />
                  <span>{selectedJob.location}</span>
                </div>

                {selectedJob.startDate && (
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(selectedJob.startDate).toLocaleDateString('es-AR')}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sky-600 font-semibold">
                  <DollarSign className="h-4 w-4" />
                  <span>${selectedJob.price?.toLocaleString('es-AR')} ARS</span>
                </div>
              </div>

              <Link
                to={`/jobs/${selectedJob.id}`}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors"
              >
                <Briefcase className="h-4 w-4" />
                Ver trabajo
              </Link>
            </div>
          )}
        </div>

        {/* Stats Bar */}
        <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-4">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-sky-500"></div>
                <span className="text-slate-600 dark:text-slate-400">
                  {categoryFilter === 'all' ? jobs.length : jobs.filter(j => j.category === categoryFilter).length} trabajos mostrados
                </span>
              </div>
              <Link
                to="/"
                className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
              >
                Ver lista completa →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
