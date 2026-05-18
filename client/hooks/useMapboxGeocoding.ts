import { useState, useEffect, useRef } from 'react';

export interface MapboxFeature {
  id: string;
  place_name: string;
  place_name_es: string;
  center: [number, number]; // [lng, lat]
  text: string;
  context?: Array<{ id: string; text: string }>;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const DEBOUNCE_MS = 300;

export function useMapboxGeocoding(debounceMs = DEBOUNCE_MS) {
  const [features, setFeatures] = useState<MapboxFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = (query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) {
      setFeatures([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      if (!MAPBOX_TOKEN) {
        setFeatures([]);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      try {
        const encoded = encodeURIComponent(query);
        const params = new URLSearchParams({
          access_token: MAPBOX_TOKEN,
          country: 'ar',
          language: 'es',
          limit: '6',
          types: 'place,district,neighborhood,locality,address',
        });
        const res = await fetch(`${BASE_URL}/${encoded}.json?${params}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error('Mapbox error');
        const data = await res.json();
        setFeatures(data.features ?? []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setFeatures([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  };

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setFeatures([]);
    setLoading(false);
  };

  useEffect(() => () => { clear(); }, []);

  return { features, loading, search, clear };
}

export function hasMapboxToken() {
  return !!MAPBOX_TOKEN;
}
