import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useMapboxGeocoding, hasMapboxToken } from '@/hooks/useMapboxGeocoding';
import { searchLocations } from '../../data/argentineLocations';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, coords?: { lng: number; lat: number }) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  disabled?: boolean;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Ej: Palermo, CABA',
  required = false,
  name = 'location',
  disabled = false,
}: LocationAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [staticSuggestions, setStaticSuggestions] = useState<string[]>([]);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useMapbox = hasMapboxToken();
  const { features, loading, search, clear } = useMapboxGeocoding();

  const suggestions = useMapbox
    ? features.map((f) => f.place_name)
    : staticSuggestions;

  const searchGeocode = useCallback(async (query: string) => {
    setGeocodeLoading(true);
    try {
      const res = await fetch(`/api/search/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && data.results?.length > 0) {
        setStaticSuggestions(data.results);
        setShowSuggestions(true);
      } else {
        const fallback = searchLocations(query, 8);
        setStaticSuggestions(fallback);
        setShowSuggestions(fallback.length > 0);
      }
    } catch {
      const fallback = searchLocations(query, 8);
      setStaticSuggestions(fallback);
      setShowSuggestions(fallback.length > 0);
    } finally {
      setGeocodeLoading(false);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);
    setSelectedIndex(-1);

    if (inputValue.length >= 2) {
      if (useMapbox) {
        search(inputValue);
        setShowSuggestions(true);
      } else {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchGeocode(inputValue), 350);
      }
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clear();
      setStaticSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelect = (placeName: string) => {
    const feature = features.find((f) => f.place_name === placeName);
    const coords = feature
      ? { lng: feature.center[0], lat: feature.center[1] }
      : undefined;
    onChange(placeName, coords);
    setShowSuggestions(false);
    clear();
    setStaticSuggestions([]);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) handleSelect(suggestions[selectedIndex]);
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          name={name}
          value={value || ''}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          className="block w-full rounded-md border-0 py-1.5 px-3 pr-9 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {(loading || geocodeLoading) && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {suggestions.map((s, index) => (
            <div
              key={s}
              onClick={() => handleSelect(s)}
              className={`cursor-pointer select-none relative py-2 pl-3 pr-9 ${
                index === selectedIndex
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin
                  className={`h-4 w-4 shrink-0 ${
                    index === selectedIndex ? 'text-white' : 'text-gray-400 dark:text-gray-500'
                  }`}
                />
                <span className={`block truncate ${index === selectedIndex ? 'font-medium' : 'font-normal'}`}>
                  {s}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
