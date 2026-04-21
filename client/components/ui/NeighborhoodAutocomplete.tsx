import { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { getNeighborhoodSuggestions, type NeighborhoodEntry } from "@/data/argNeighborhoods";

interface Props {
  locationValue: string;
  neighborhood: string;
  postalCode: string;
  onNeighborhoodChange: (value: string) => void;
  onPostalCodeChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
}

export default function NeighborhoodAutocomplete({
  locationValue,
  neighborhood,
  postalCode,
  onNeighborhoodChange,
  onPostalCodeChange,
  disabled,
  inputClassName,
}: Props) {
  const [suggestions, setSuggestions] = useState<NeighborhoodEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const baseInputClass =
    inputClassName ||
    "block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNeighborhoodInput = (value: string) => {
    onNeighborhoodChange(value);
    const results = getNeighborhoodSuggestions(locationValue, value);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const handleFocus = () => {
    const results = getNeighborhoodSuggestions(locationValue, neighborhood);
    if (results.length > 0) {
      setSuggestions(results);
      setShowSuggestions(true);
    }
  };

  const handleSelect = (entry: NeighborhoodEntry) => {
    onNeighborhoodChange(entry.neighborhood);
    onPostalCodeChange(entry.postalCode);
    setShowSuggestions(false);
  };

  const hasSuggestions = getNeighborhoodSuggestions(locationValue, "").length > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Neighborhood field */}
      <div ref={wrapperRef} className="relative">
        <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            Barrio
          </div>
        </label>
        <input
          type="text"
          value={neighborhood}
          onChange={(e) => handleNeighborhoodInput(e.target.value)}
          onFocus={handleFocus}
          placeholder={hasSuggestions ? "Escribí para ver sugerencias…" : "Ej: Palermo, Villa Crespo"}
          disabled={disabled}
          className={baseInputClass}
          autoComplete="off"
        />
        {showSuggestions && (
          <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {suggestions.map((entry) => (
              <li
                key={`${entry.neighborhood}-${entry.postalCode}`}
                onMouseDown={() => handleSelect(entry)}
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/30 text-sm text-slate-800 dark:text-slate-200"
              >
                <span>{entry.neighborhood}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">{entry.postalCode}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Postal code field */}
      <div>
        <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            Código Postal
          </div>
        </label>
        <input
          type="text"
          value={postalCode}
          onChange={(e) => onPostalCodeChange(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
          placeholder="Ej: C1425 o 1425"
          maxLength={8}
          disabled={disabled}
          className={baseInputClass}
        />
      </div>
    </div>
  );
}
