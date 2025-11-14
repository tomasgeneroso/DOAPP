import { useState, useRef, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { searchLocations } from '../../data/argentineLocations';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Ej: Palermo, CABA",
  required = false,
  name = "location"
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);

    if (inputValue.length >= 2) {
      const results = searchLocations(inputValue, 8);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    onChange(suggestion);
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
          type="text"
          name={name}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.length >= 2 && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          required={required}
          className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
          autoComplete="off"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`cursor-pointer select-none relative py-2 pl-3 pr-9 ${
                index === selectedIndex
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className={`h-4 w-4 ${
                  index === selectedIndex
                    ? 'text-white'
                    : 'text-gray-400 dark:text-gray-500'
                }`} />
                <span className={`block truncate ${
                  index === selectedIndex ? 'font-medium' : 'font-normal'
                }`}>
                  {suggestion}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
