import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Tag, X, SlidersHorizontal, Briefcase, Users } from "lucide-react";
import { JOB_CATEGORIES } from "../../shared/constants/categories";
import { searchLocations } from "../../shared/constants/locations";

interface SearchBarProps {
  onSearch: (filters: SearchFilters) => void;
  onSearchChange?: (filters: SearchFilters) => void;
}

export interface SearchFilters {
  query: string;
  location: string;
  category: string;
  tags: string[];
  minBudget?: number;
  maxBudget?: number;
  sortBy?: 'date' | 'budget-asc' | 'budget-desc' | 'proximity';
  searchType?: 'jobs' | 'users';
}

export default function SearchBar({ onSearch, onSearchChange }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState<string>("");
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [sortBy, setSortBy] = useState<SearchFilters['sortBy']>('date');
  const [searchType, setSearchType] = useState<'jobs' | 'users'>('jobs');
  const [showFilters, setShowFilters] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<ReturnType<typeof searchLocations>>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [showQueryLocationSuggestions, setShowQueryLocationSuggestions] = useState(false);
  const [queryLocationSuggestions, setQueryLocationSuggestions] = useState<ReturnType<typeof searchLocations>>([]);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const querySuggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        locationInputRef.current &&
        !locationInputRef.current.contains(event.target as Node)
      ) {
        setShowLocationSuggestions(false);
      }

      if (
        querySuggestionsRef.current &&
        !querySuggestionsRef.current.contains(event.target as Node) &&
        queryInputRef.current &&
        !queryInputRef.current.contains(event.target as Node)
      ) {
        setShowQueryLocationSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Trigger real-time search with debounce
  const triggerRealTimeSearch = () => {
    if (!onSearchChange) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onSearchChange({
        query,
        location,
        category,
        tags,
        minBudget: minBudget ? parseFloat(minBudget) : undefined,
        maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
        sortBy,
        searchType,
      });
    }, 500); // 500ms debounce
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);

    // Detectar si el usuario está escribiendo una ubicación
    // Buscar sugerencias si hay al menos 2 caracteres y parece ser texto de ubicación
    if (value.length >= 2) {
      // Extraer la última palabra o frase después de coma/espacio
      const words = value.trim().split(/\s+/);
      const lastWord = words[words.length - 1];

      // También buscar después de comas (para casos como "plomero en Palermo, CABA")
      const parts = value.split(',');
      const lastPart = parts[parts.length - 1].trim();

      // Buscar con la última palabra o la última parte después de coma
      const searchTerm = lastPart.length > lastWord.length ? lastPart : lastWord;

      if (searchTerm.length >= 2) {
        const suggestions = searchLocations(searchTerm, 8);
        if (suggestions.length > 0) {
          setQueryLocationSuggestions(suggestions);
          setShowQueryLocationSuggestions(true);
        } else {
          setShowQueryLocationSuggestions(false);
        }
      } else {
        setShowQueryLocationSuggestions(false);
      }
    } else {
      setShowQueryLocationSuggestions(false);
    }
  };

  const handleSelectQueryLocation = (locationValue: string) => {
    // Extraer el nombre corto de la ciudad para agregarlo al query
    const locationLabel = queryLocationSuggestions.find(s => s.value === locationValue)?.label || locationValue;

    // Si el query ya tiene contenido, agregar la ubicación al final
    // Si está vacío, solo poner la ubicación
    const currentQuery = query.trim();

    // Remover la última palabra/parte que se estaba escribiendo
    let newQuery = currentQuery;

    // Si hay una coma, reemplazar todo después de la última coma
    if (currentQuery.includes(',')) {
      const parts = currentQuery.split(',');
      parts[parts.length - 1] = '';
      newQuery = parts.join(',').trim();
      if (newQuery) {
        newQuery += ', ' + locationLabel;
      } else {
        newQuery = locationLabel;
      }
    } else {
      // Si no hay coma, remover la última palabra y agregar la ubicación
      const words = currentQuery.split(/\s+/);
      if (words.length > 1) {
        words[words.length - 1] = '';
        newQuery = words.join(' ').trim() + ' en ' + locationLabel;
      } else {
        newQuery = locationLabel;
      }
    }

    setQuery(newQuery);
    setLocation(locationValue);
    setShowQueryLocationSuggestions(false);
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    const suggestions = searchLocations(value);
    setLocationSuggestions(suggestions);
    setShowLocationSuggestions(suggestions.length > 0);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
  };

  // Trigger search whenever filters change
  useEffect(() => {
    triggerRealTimeSearch();
  }, [query, location, category, tags, minBudget, maxBudget, sortBy, searchType]);

  const handleSelectLocation = (locationValue: string) => {
    setLocation(locationValue);
    setShowLocationSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowLocationSuggestions(false);
    onSearch({
      query,
      location,
      category,
      tags,
      minBudget: minBudget ? parseFloat(minBudget) : undefined,
      maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
      sortBy,
      searchType,
    });
  };

  const handleClear = () => {
    setQuery("");
    setLocation("");
    setCategory("");
    setTags([]);
    setMinBudget("");
    setMaxBudget("");
    setSortBy('date');
    setSearchType('jobs');
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    setQueryLocationSuggestions([]);
    setShowQueryLocationSuggestions(false);
    onSearch({
      query: "",
      location: "",
      category: "",
      tags: [],
      minBudget: undefined,
      maxBudget: undefined,
      sortBy: 'date',
      searchType: 'jobs',
    });
  };

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter((t) => t !== tag));
    } else {
      setTags([...tags, tag]);
    }
  };

  const hasActiveFilters = location || category || tags.length > 0 || minBudget || maxBudget || sortBy !== 'date';

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Search Type Toggle */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Buscar:</span>
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setSearchType('jobs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                searchType === 'jobs'
                  ? 'bg-white dark:bg-slate-600 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Buscar trabajos disponibles por categoría, ubicación o descripción"
            >
              <Briefcase className="h-4 w-4" />
              Trabajos
            </button>
            <button
              type="button"
              onClick={() => setSearchType('users')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                searchType === 'users'
                  ? 'bg-white dark:bg-slate-600 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Buscar profesionales por nombre de usuario o habilidades"
            >
              <Users className="h-4 w-4" />
              Perfiles
            </button>
          </div>
        </div>

        {/* Main Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={searchType === 'users' ? "Buscar usuarios por nombre o @usuario..." : "Buscar por título, descripción, palabras clave..."}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* Only show filters button for jobs search */}
          {searchType === 'jobs' && (
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                showFilters || hasActiveFilters
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
              title="Filtrar por ubicación, categoría, presupuesto y más opciones"
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-xs text-white">
                  {(location ? 1 : 0) + (category ? 1 : 0) + tags.length + (minBudget ? 1 : 0) + (maxBudget ? 1 : 0) + (sortBy !== 'date' ? 1 : 0)}
                </span>
              )}
            </button>
          )}

          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors"
          >
            Buscar
          </button>
        </div>

        {/* Advanced Filters - Only for jobs */}
        {showFilters && searchType === 'jobs' && (
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Filtros avanzados
              </h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Location */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <MapPin className="inline h-4 w-4 mr-1" />
                Ubicación
              </label>
              <input
                ref={locationInputRef}
                type="text"
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => location && setShowLocationSuggestions(locationSuggestions.length > 0)}
                placeholder="Ej: Palermo, CABA o zona específica"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />

              {/* Autocomplete suggestions */}
              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {locationSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectLocation(suggestion.value)}
                      className="w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors"
                    >
                      <MapPin className="h-4 w-4 text-sky-500 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-slate-900 dark:text-white font-medium">
                          {suggestion.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {suggestion.zone} • {suggestion.city}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category */}
            <div data-onboarding="categories">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Tag className="inline h-4 w-4 mr-1" />
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="">Todas las categorías</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Etiquetas populares
              </label>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="hover:text-sky-600 dark:hover:text-sky-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {["urgente", "plomeria", "electricidad", "limpieza", "pintura", "construccion", "reparacion", "mantenimiento"].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      tags.includes(tag)
                        ? "bg-sky-500 text-white"
                        : "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget Range */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Rango de presupuesto
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minBudget" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Mínimo
                  </label>
                  <input
                    id="minBudget"
                    type="number"
                    value={minBudget}
                    onChange={(e) => setMinBudget(e.target.value)}
                    placeholder="$ 0"
                    min="0"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="maxBudget" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Máximo
                  </label>
                  <input
                    id="maxBudget"
                    type="number"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(e.target.value)}
                    placeholder="$ Sin límite"
                    min="0"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Ordenar por
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SearchFilters['sortBy'])}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="date">Fecha de publicación</option>
                <option value="budget-asc">Presupuesto (menor a mayor)</option>
                <option value="budget-desc">Presupuesto (mayor a menor)</option>
                <option value="proximity">Cercanía</option>
              </select>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
