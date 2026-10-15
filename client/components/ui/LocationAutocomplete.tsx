import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { buscarLugares, type LugarSugerido } from '../../../shared/geo/lugares';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, coords?: { lng: number; lat: number }) => void;
  /**
   * Se llama al elegir una sugerencia, con todo lo que se sabe del lugar (calle, número, barrio, código postal, ubicación): así
   * el formulario puede completar los campos de abajo en vez de dejar que la persona los escriba a mano.
   */
  onPlaceSelect?: (lugar: LugarSugerido) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  disabled?: boolean;
}

/** Lo que queda escrito en «Ubicación»: la ciudad y la provincia (la calle, el barrio y el número tienen su campo). */
export function textoDeUbicacion(l: LugarSugerido): string {
  const zona = [l.ciudad, l.provincia].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
  return zona || l.etiqueta;
}

export default function LocationAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Ej: Palermo, CABA',
  required = false,
  name = 'location',
  disabled = false,
}: LocationAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<LugarSugerido[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlRef = useRef<AbortController | null>(null);

  // Lugares reales de OpenStreetMap (Nominatim) con el detalle de la dirección, sin clave: es el mismo servicio de los mapas de la app.
  const searchLocations = useCallback(async (query: string) => {
    controlRef.current?.abort();
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const c = new AbortController();
    controlRef.current = c;
    setLoading(true);
    const lista = await buscarLugares(query, { signal: c.signal });
    if (c.signal.aborted) return;
    setSuggestions(lista);
    setShowSuggestions(true);
    setLoading(false);
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

    if (inputValue.trim().length >= 3) {
      // 500ms debounce respects Nominatim's usage policy
      debounceRef.current = setTimeout(() => searchLocations(inputValue), 500);
    } else {
      controlRef.current?.abort();
      setSuggestions([]);
      setShowSuggestions(false);
      setLoading(false);
    }
  };

  const handleSelect = (s: LugarSugerido) => {
    onChange(textoDeUbicacion(s), { lat: s.lat, lng: s.lon });
    onPlaceSelect?.(s);
    setShowSuggestions(false);
    setSuggestions([]);
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
        if (selectedIndex >= 0) {
          e.preventDefault();
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
        autoComplete="off"
        className={`block w-full rounded-md border-0 py-2 pl-11 pr-4 text-gray-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div role="listbox" className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto animate-fadeIn">
          {suggestions.map((s, index) => {
            const [principal, ...resto] = s.etiqueta.split(', ');
            return (
              <button
                key={s.etiqueta}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => handleSelect(s)}
                className={`w-full px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors ${
                  index === selectedIndex ? 'bg-sky-100 dark:bg-sky-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{principal}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {resto.join(', ')}
                      {s.codigoPostal ? ` · CP ${s.codigoPostal}` : ''}
                    </p>
                  </div>
                  {s.numero && <span className="text-[11px] rounded bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 text-emerald-800 dark:text-emerald-300">dirección exacta</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
