import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Search, MapPin, Tag, X, SlidersHorizontal, Briefcase, Users } from "lucide-react";
import { JOB_CATEGORIES } from "../../shared/constants/categories";
import { searchLocations } from "../../shared/constants/locations";
import analytics from "../utils/analytics";

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
  const { t } = useTranslation();
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

    if (searchType === 'users') {
      setShowQueryLocationSuggestions(false);
      return;
    }

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
    if (value) analytics.filterApply('category', value, 'search_bar');
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
    analytics.jobSearch(query, { category, location });
    if (location) analytics.filterApply('location', location, 'search_bar');
    if (category) analytics.filterApply('category', category, 'search_bar');
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
          <span className="text-sm text-slate-600 dark:text-slate-400">{t('home.searchLabel')}</span>
          <div className="relative flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            {/* Sliding pill indicator */}
            <div
              className={`absolute inset-y-1 w-[calc(50%-2px)] rounded-md bg-white dark:bg-slate-600 shadow-sm transition-all duration-200 ease-in-out ${
                searchType === 'users' ? 'left-[calc(50%+1px)]' : 'left-1'
              }`}
            />
            <button
              type="button"
              onClick={() => { setSearchType('jobs'); analytics.filterApply('search_type', 'jobs', 'search_bar'); }}
              className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 w-1/2 rounded-md text-sm font-medium transition-colors duration-200 ${
                searchType === 'jobs'
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t('search.jobsTooltip', 'Search available jobs by category, location or description')}
            >
              <Briefcase className="h-4 w-4" />
              {t('home.jobsTab')}
            </button>
            <button
              type="button"
              onClick={() => { setSearchType('users'); analytics.filterApply('search_type', 'users', 'search_bar'); }}
              className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 w-1/2 rounded-md text-sm font-medium transition-colors duration-200 ${
                searchType === 'users'
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t('search.usersTooltip', 'Search professionals by username or skills')}
            >
              <Users className="h-4 w-4" />
              {t('home.profilesTab')}
            </button>
          </div>
        </div>

        {/* Main Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              ref={queryInputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => {
                if (queryLocationSuggestions.length > 0) setShowQueryLocationSuggestions(true);
              }}
              placeholder={searchType === 'users' ? t('home.searchUsers') : t('home.searchByTitle')}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
            {showQueryLocationSuggestions && queryLocationSuggestions.length > 0 && (
              <div
                ref={querySuggestionsRef}
                className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden"
              >
                {queryLocationSuggestions.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => handleSelectQueryLocation(s.value)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
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
              title={t('search.filtersTooltip', 'Filter by location, category, budget and more options')}
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span className="hidden sm:inline">{t('jobs.filters')}</span>
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
            {t('common.search')}
          </button>
        </div>

        {/* Advanced Filters - Only for jobs */}
        {showFilters && searchType === 'jobs' && (
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('home.advancedFilters')}
              </h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
                >
                  {t('jobs.clearFilters', 'Clear filters')}
                </button>
              )}
            </div>

            {/* Location */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <MapPin className="inline h-4 w-4 mr-1" />
                {t('jobs.location', 'Location')}
              </label>
              <input
                ref={locationInputRef}
                type="text"
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => location && setShowLocationSuggestions(locationSuggestions.length > 0)}
                placeholder={t('search.locationPlaceholder', 'E.g.: Palermo, CABA or specific area')}
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
                {t('jobs.category', 'Category')}
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="">{t('search.allCategories', 'All categories')}</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {t(cat.labelKey, cat.label)}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('search.popularTags', 'Popular tags')}
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
                {t('search.budgetRange', 'Budget range')}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minBudget" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    {t('common.minimum', 'Minimum')}
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
                    {t('common.maximum', 'Maximum')}
                  </label>
                  <input
                    id="maxBudget"
                    type="number"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(e.target.value)}
                    placeholder={t('search.noLimit', '$ No limit')}
                    min="0"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('jobs.sortBy')}
              </label>
              <select
                value={sortBy}
                onChange={(e) => { const v = e.target.value as SearchFilters['sortBy']; setSortBy(v); analytics.filterApply('sort_by', v || 'date', 'search_bar'); }}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="date">{t('search.sortByDate', 'Publication date')}</option>
                <option value="budget-asc">{t('search.sortBudgetAsc', 'Budget (low to high)')}</option>
                <option value="budget-desc">{t('search.sortBudgetDesc', 'Budget (high to low)')}</option>
                <option value="proximity">{t('search.sortProximity', 'Proximity')}</option>
              </select>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
