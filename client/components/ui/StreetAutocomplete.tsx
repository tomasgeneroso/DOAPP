import { useState, useRef, useEffect, useCallback } from 'react';
import { Home, Loader2 } from 'lucide-react';

interface StreetAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  location: string; // City/neighborhood to filter streets
  placeholder?: string;
  disabled?: boolean;
}

interface StreetSuggestion {
  display_name: string;
  street: string;
}

// Cache for street searches
const streetCache: { [key: string]: StreetSuggestion[] } = {};

// Debounce function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default function StreetAutocomplete({
  value,
  onChange,
  location,
  placeholder = "Ej: Av. Santa Fe",
  disabled = false
}: StreetAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<StreetSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Search streets using Nominatim
  const searchStreets = useCallback(async (query: string) => {
    if (!query || query.length < 3 || !location) {
      setSuggestions([]);
      return;
    }

    const cacheKey = `${location}:${query}`.toLowerCase();

    // Check cache first
    if (streetCache[cacheKey]) {
      setSuggestions(streetCache[cacheKey]);
      setShowSuggestions(streetCache[cacheKey].length > 0);
      return;
    }

    setLoading(true);

    try {
      // Build search query with location context
      const searchQuery = `${query}, ${location}, Argentina`;

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=ar&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Extract unique street names from results
        const streetResults: StreetSuggestion[] = [];
        const seenStreets = new Set<string>();

        for (const result of data) {
          const street = result.address?.road || result.address?.pedestrian || result.address?.residential;
          if (street && !seenStreets.has(street.toLowerCase())) {
            seenStreets.add(street.toLowerCase());
            streetResults.push({
              display_name: street,
              street: street,
            });
          }
        }

        // Also add the typed value as an option if not already present
        if (query.length >= 3 && !seenStreets.has(query.toLowerCase())) {
          streetResults.unshift({
            display_name: query,
            street: query,
          });
        }

        streetCache[cacheKey] = streetResults;
        setSuggestions(streetResults);
        setShowSuggestions(streetResults.length > 0);
      }
    } catch (error) {
      console.error('Error searching streets:', error);
      // Fallback: just allow the typed value
      setSuggestions([{ display_name: query, street: query }]);
      setShowSuggestions(true);
    } finally {
      setLoading(false);
    }
  }, [location]);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((query: string) => searchStreets(query), 400),
    [searchStreets]
  );

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);
    setSelectedIndex(-1);

    if (inputValue.length >= 3) {
      debouncedSearch(inputValue);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (suggestion: StreetSuggestion) => {
    onChange(suggestion.street);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
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
          ref={inputRef}
          type="text"
          value={value || ''}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value && value.length >= 3 && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled || !location}
          className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
          </div>
        )}
      </div>

      {!location && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Selecciona primero una ciudad para buscar calles
        </p>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.street}-${index}`}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`cursor-pointer select-none relative py-2 pl-3 pr-9 ${
                index === selectedIndex
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Home className={`h-4 w-4 ${
                  index === selectedIndex
                    ? 'text-white'
                    : 'text-gray-400 dark:text-gray-500'
                }`} />
                <span className={`block truncate ${
                  index === selectedIndex ? 'font-medium' : 'font-normal'
                }`}>
                  {suggestion.display_name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
