import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Loader2 } from 'lucide-react';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, coords?: { lng: number; lat: number }) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  disabled?: boolean;
}

interface GooglePrediction {
  description: string;
  place_id: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Ej: Palermo, CABA',
  required = false,
  name = 'location',
  disabled = false,
}: LocationAutocompleteProps) {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<GooglePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  // Initialize Google Places Services
  useEffect(() => {
    if (window.google && !autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
      // Create a dummy map element for PlacesService
      const dummyDiv = document.createElement('div');
      placesServiceRef.current = new google.maps.places.PlacesService(dummyDiv);
    }
  }, []);

  const searchLocations = useCallback(async (query: string) => {
    if (!query || query.length < 2 || !autocompleteServiceRef.current) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const predictions = await autocompleteServiceRef.current.getPlacePredictions({
        input: query,
        componentRestrictions: { country: 'ar' }, // Restrict to Argentina
        types: ['geocode', 'establishment'],
      });

      if (predictions.predictions) {
        setSuggestions(predictions.predictions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Google Places error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
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

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (inputValue.length >= 2) {
      debounceRef.current = setTimeout(() => searchLocations(inputValue), 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelect = (prediction: GooglePrediction) => {
    onChange(prediction.description);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);

    // Get detailed place info including coordinates
    if (placesServiceRef.current) {
      placesServiceRef.current.getDetails(
        { placeId: prediction.place_id, fields: ['geometry', 'formatted_address'] },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
            const coords = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            };
            onChange(prediction.description, coords);
          }
        }
      );
    }
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
        if (selectedIndex >= 0) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        <MapPin className="h-5 w-5 text-gray-400 dark:text-gray-500" />
      </div>

      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => value && suggestions.length > 0 && setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className={`
          w-full h-14 pl-11 pr-4 py-2
          bg-white dark:bg-gray-800
          border-2 rounded-xl
          text-gray-900 dark:text-white
          transition-all duration-200
          cursor-pointer
          border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500
          focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 dark:ring-sky-400/20
          placeholder:text-gray-400 dark:placeholder:text-gray-500
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-900' : ''}
        `}
      />

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {suggestions.map((prediction, index) => (
            <button
              key={prediction.place_id}
              onClick={() => handleSelect(prediction)}
              className={`
                w-full px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700 last:border-b-0
                transition-colors
                ${index === selectedIndex
                  ? 'bg-sky-100 dark:bg-sky-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }
              `}
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {prediction.description.split(',')[0]}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {prediction.description.split(',').slice(1).join(',')}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
