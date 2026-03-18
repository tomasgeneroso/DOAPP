import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PlusCircle, MessageCircle, Lock, CheckCircle, MapPin, Calendar, Star, Package, Briefcase, User, Sun, Moon, Search, ArrowRight, Filter, X, DollarSign, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Job } from '../../types';
import { getJobs, getCategories } from '../../services/jobs';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import Svg, { Path, Rect, G, Defs, ClipPath } from 'react-native-svg';
import Logo from '../../components/ui/Logo';
import LocationAutocomplete from '../../components/ui/LocationAutocomplete';

type HomeTab = 'jobs' | 'users';

const POPULAR_TAGS = ['urgente', 'plomería', 'electricidad', 'limpieza', 'pintura', 'construcción', 'reparación', 'mantenimiento'];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'date', label: 'Fecha de publicación' },
  { value: 'budget-asc', label: 'Presupuesto (menor a mayor)' },
  { value: 'budget-desc', label: 'Presupuesto (mayor a menor)' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { isDarkMode, toggleTheme, colors: themeColors } = useTheme();

  const [activeTab, setActiveTab] = useState<HomeTab>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinBudget, setFilterMinBudget] = useState('');
  const [filterMaxBudget, setFilterMaxBudget] = useState('');
  const [filterSortBy, setFilterSortBy] = useState('date');
  const [selectedTag, setSelectedTag] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSortPicker, setShowSortPicker] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = useMemo(() => getCategories(), []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterLocation) count++;
    if (filterCategory) count++;
    if (filterMinBudget) count++;
    if (filterMaxBudget) count++;
    if (filterSortBy !== 'date') count++;
    if (selectedTag) count++;
    return count;
  }, [filterLocation, filterCategory, filterMinBudget, filterMaxBudget, filterSortBy, selectedTag]);

  const buildFilters = useCallback((pageNum: number) => {
    const filters: any = { page: pageNum, limit: 10, status: 'open' };
    const query = searchQuery.trim();
    if (query) filters.query = query;
    if (filterLocation) filters.location = filterLocation;
    if (filterCategory) filters.category = filterCategory;
    if (filterMinBudget) filters.minPrice = Number(filterMinBudget);
    if (filterMaxBudget) filters.maxPrice = Number(filterMaxBudget);
    if (filterSortBy !== 'date') filters.sortBy = filterSortBy;
    if (selectedTag) filters.tags = selectedTag;
    return filters;
  }, [searchQuery, filterLocation, filterCategory, filterMinBudget, filterMaxBudget, filterSortBy, selectedTag]);

  const fetchJobs = async (pageNum: number = 1, refresh: boolean = false) => {
    try {
      const filters = buildFilters(pageNum);
      const response = await getJobs(filters);

      // Backend returns jobs at root level: { success, count, jobs }
      const jobsList = (response as any).jobs || response.data || [];
      if (response.success && jobsList.length >= 0) {
        if (refresh || pageNum === 1) {
          setJobs(jobsList);
        } else {
          setJobs((prev) => [...prev, ...jobsList]);
        }
        const pagination = (response as any).pagination;
        setHasMore(pagination ? pagination.page < pagination.pages : jobsList.length >= 10);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setLoading(true);
      fetchJobs(1, true);
    }, 500);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Re-fetch when filters change (not search query - that's debounced separately)
  const applyFilters = useCallback(() => {
    setPage(1);
    setLoading(true);
    fetchJobs(1, true);
  }, [buildFilters]);

  useEffect(() => {
    applyFilters();
  }, [filterLocation, filterCategory, filterMinBudget, filterMaxBudget, filterSortBy, selectedTag]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchJobs(1, true);
  }, [buildFilters]);

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchJobs(nextPage);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterLocation('');
    setFilterCategory('');
    setFilterMinBudget('');
    setFilterMaxBudget('');
    setFilterSortBy('date');
    setSelectedTag('');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const renderHero = () => (
    <View style={[styles.heroSection, !isAuthenticated && { backgroundColor: themeColors.card }]}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Logo size={isAuthenticated ? 'large' : 'xlarge'} />
      </View>

      <Text style={[styles.heroTitle, { color: themeColors.text.primary }]}>
        {user ? (
          `¡Hola de nuevo, ${user.name?.split(' ')[0]}!`
        ) : (
          <>
            Publicá el servicio que necesites o{' '}
            <Text style={[styles.heroTitleAccent, { color: themeColors.primary[600] }]}>encontrá oportunidades</Text>
            {' '}para ofrecer tus servicios.
          </>
        )}
      </Text>
      <Text style={[styles.heroSubtitle, { color: themeColors.text.secondary }]}>
        {user
          ? '¿Listo para empezar un nuevo proyecto o buscar oportunidades?'
          : 'En DoApp, conectamos personas que necesitan servicios con quienes saben hacerlos. Garantizamos que el trabajo se complete o te devolvemos el dinero.'}
      </Text>

      {!user && (
        <Text style={[styles.heroSmallText, { color: themeColors.text.muted }]}>
          Nos aseguramos que cada acuerdo se cumpla por ambas partes. Publicá un trabajo, negociá directamente con la persona y pagá automáticamente solo cuando todo esté verificado.
        </Text>
      )}

      {!isAuthenticated && (
        <View style={styles.heroButtons}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: themeColors.primary[600] }]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.primaryButtonText}>Registrate gratis</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderHowItWorksClient = () => (
    <View style={[styles.howItWorksCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.howItWorksTitle, { color: themeColors.text.primary }]}>¿Necesitás un servicio?</Text>
      <Text style={[styles.howItWorksSubtitle, { color: themeColors.text.secondary }]}>Publicá tu trabajo y encontrá profesionales</Text>

      <View style={styles.stepsGrid}>
        <View style={styles.stepsRow}>
          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: colors.primary[500] }]}>
              <PlusCircle size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Publicá</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Publicá tu servicio con los detalles que necesitás</Text>
          </View>

          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: colors.secondary[500] }]}>
              <MessageCircle size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={[styles.stepNumber, { backgroundColor: colors.secondary[600] }]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Elegí</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Recibí propuestas y elegí al mejor perfil</Text>
          </View>
        </View>

        <View style={styles.stepsRow}>
          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: '#8b5cf6' }]}>
              <Lock size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={[styles.stepNumber, { backgroundColor: '#8b5cf6' }]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Pagá Seguro</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Tu dinero queda en garantía hasta completar</Text>
          </View>

          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: colors.success[500] }]}>
              <CheckCircle size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={[styles.stepNumber, { backgroundColor: colors.success[600] }]}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>¡Listo!</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Confirmá el servicio prestado y el pago se libera automáticamente</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderHowItWorksWorker = () => (
    <View style={[styles.howItWorksCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.howItWorksTitle, { color: themeColors.text.primary }]}>¿Ofrecés servicios?</Text>
      <Text style={[styles.howItWorksSubtitle, { color: themeColors.text.secondary }]}>Encontrá trabajos, mostrá tu portfolio y empezá a ganar</Text>

      <View style={styles.stepsGrid}>
        <View style={styles.stepsRow}>
          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: colors.primary[500] }]}>
              <Search size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Buscá</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Explorá trabajos que se ajusten a tus habilidades</Text>
          </View>

          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: colors.secondary[500] }]}>
              <MessageCircle size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={[styles.stepNumber, { backgroundColor: colors.secondary[600] }]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Aplicá</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Enviá tu propuesta con tu mejor oferta</Text>
          </View>
        </View>

        <View style={styles.stepsRow}>
          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: '#8b5cf6' }]}>
              <Briefcase size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={[styles.stepNumber, { backgroundColor: '#8b5cf6' }]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Trabajá</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Realizá el trabajo con tranquilidad</Text>
          </View>

          <View style={styles.stepGridItem}>
            <View style={[styles.stepIcon, { backgroundColor: colors.success[500] }]}>
              <CheckCircle size={24} color="#fff" strokeWidth={2} />
            </View>
            <View style={[styles.stepNumber, { backgroundColor: colors.success[600] }]}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Cobrá</Text>
            <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Recibí tu pago de forma segura y garantizada</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderSecurityBanner = () => (
    <View style={[styles.securityBanner, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
      <View style={styles.securityIconContainer}>
        <Lock size={24} color={themeColors.primary[600]} strokeWidth={2} />
      </View>
      <View style={styles.securityContent}>
        <Text style={[styles.securityTitle, { color: themeColors.text.primary }]}>En DoApp, cada contrato queda protegido:</Text>
        <Text style={[styles.securityText, { color: themeColors.text.secondary }]}>
          el dinero se mantiene en garantía hasta que ambas partes confirman que el trabajo fue entregado.
        </Text>
      </View>
    </View>
  );

  const renderSearchAndFilters = () => (
    <View style={styles.searchSection}>
      {/* Search Input */}
      <View style={[styles.searchInputContainer, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Search size={18} color={themeColors.text.muted} strokeWidth={2} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text.primary }]}
          placeholder="Buscar trabajos..."
          placeholderTextColor={themeColors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={18} color={themeColors.text.muted} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Popular Tags */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll} contentContainerStyle={styles.tagsContainer}>
        {POPULAR_TAGS.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[
              styles.tagChip,
              {
                backgroundColor: selectedTag === tag ? themeColors.primary[600] : themeColors.card,
                borderColor: selectedTag === tag ? themeColors.primary[600] : themeColors.border,
              },
            ]}
            onPress={() => setSelectedTag(selectedTag === tag ? '' : tag)}
          >
            <Text style={[styles.tagText, { color: selectedTag === tag ? '#fff' : themeColors.text.secondary }]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filters Toggle Button */}
      <View style={styles.filtersToggleRow}>
        <TouchableOpacity
          style={[styles.filtersToggleBtn, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={16} color={themeColors.primary[600]} strokeWidth={2} />
          <Text style={[styles.filtersToggleText, { color: themeColors.text.primary }]}>Filtros</Text>
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: themeColors.primary[600] }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
          {showFilters ? (
            <ChevronUp size={16} color={themeColors.text.muted} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
          )}
        </TouchableOpacity>

        {(activeFilterCount > 0 || searchQuery) && (
          <TouchableOpacity onPress={clearAllFilters} style={styles.clearFiltersBtn}>
            <X size={14} color={colors.danger[500]} strokeWidth={2} />
            <Text style={[styles.clearFiltersText, { color: colors.danger[500] }]}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded Filters */}
      {showFilters && (
        <View style={[styles.filtersPanel, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          {/* Location */}
          <View style={styles.filterField}>
            <Text style={[styles.filterLabel, { color: themeColors.text.secondary }]}>Ubicación</Text>
            <LocationAutocomplete
              value={filterLocation}
              onChangeText={setFilterLocation}
              placeholder="Ej: Palermo, CABA"
              themeColors={themeColors}
            />
          </View>

          {/* Category */}
          <View style={styles.filterField}>
            <Text style={[styles.filterLabel, { color: themeColors.text.secondary }]}>Categoría</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border }]}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <Text style={[styles.pickerBtnText, { color: filterCategory ? themeColors.text.primary : themeColors.text.muted }]}>
                {filterCategory || 'Todas las categorías'}
              </Text>
              <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
            </TouchableOpacity>
            {showCategoryPicker && (
              <View style={[styles.pickerDropdown, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <ScrollView style={styles.pickerScrollView} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={[styles.pickerOption, { borderBottomColor: themeColors.border }]}
                    onPress={() => { setFilterCategory(''); setShowCategoryPicker(false); }}
                  >
                    <Text style={[styles.pickerOptionText, { color: themeColors.text.secondary }]}>Todas las categorías</Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pickerOption, { borderBottomColor: themeColors.border }, filterCategory === cat && { backgroundColor: themeColors.primary[50] }]}
                      onPress={() => { setFilterCategory(cat); setShowCategoryPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, { color: filterCategory === cat ? themeColors.primary[600] : themeColors.text.primary }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Budget Range */}
          <View style={styles.filterField}>
            <Text style={[styles.filterLabel, { color: themeColors.text.secondary }]}>Presupuesto (ARS)</Text>
            <View style={styles.budgetRow}>
              <View style={styles.budgetInputWrap}>
                <DollarSign size={14} color={themeColors.text.muted} strokeWidth={2} />
                <TextInput
                  style={[styles.budgetInput, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="Mín"
                  placeholderTextColor={themeColors.text.muted}
                  value={filterMinBudget}
                  onChangeText={setFilterMinBudget}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.budgetSeparator, { color: themeColors.text.muted }]}>—</Text>
              <View style={styles.budgetInputWrap}>
                <DollarSign size={14} color={themeColors.text.muted} strokeWidth={2} />
                <TextInput
                  style={[styles.budgetInput, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="Máx"
                  placeholderTextColor={themeColors.text.muted}
                  value={filterMaxBudget}
                  onChangeText={setFilterMaxBudget}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Sort */}
          <View style={styles.filterField}>
            <Text style={[styles.filterLabel, { color: themeColors.text.secondary }]}>Ordenar por</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border }]}
              onPress={() => setShowSortPicker(!showSortPicker)}
            >
              <Text style={[styles.pickerBtnText, { color: themeColors.text.primary }]}>
                {SORT_OPTIONS.find(o => o.value === filterSortBy)?.label || 'Fecha de publicación'}
              </Text>
              <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
            </TouchableOpacity>
            {showSortPicker && (
              <View style={[styles.pickerDropdown, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.pickerOption, { borderBottomColor: themeColors.border }, filterSortBy === opt.value && { backgroundColor: themeColors.primary[50] }]}
                    onPress={() => { setFilterSortBy(opt.value); setShowSortPicker(false); }}
                  >
                    <Text style={[styles.pickerOptionText, { color: filterSortBy === opt.value ? themeColors.primary[600] : themeColors.text.primary }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );

  const renderJob = ({ item }: { item: Job }) => {
    const client = typeof item.client === 'object' ? item.client : null;

    return (
      <TouchableOpacity
        style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => router.push(`/job/${item._id || item.id}`)}
        activeOpacity={0.7}
      >
        {/* Price Badge */}
        <View style={[styles.priceBadge, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
          <Text style={[styles.priceText, { color: themeColors.primary[600] }]}>{formatPrice(item.budget || item.price)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Client Rating */}
        {client && (
          <View style={styles.ratingContainer}>
            <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} strokeWidth={2} />
            <Text style={[styles.ratingText, { color: themeColors.text.secondary }]}>
              {Number(client.rating || 5).toFixed(1)} ({client.reviewsCount || 0})
            </Text>
          </View>
        )}

        {/* Description */}
        <Text style={[styles.jobDescription, { color: themeColors.text.secondary }]} numberOfLines={2}>
          {item.description || item.summary}
        </Text>

        {/* Footer */}
        <View style={styles.jobFooter}>
          <View style={styles.locationRow}>
            <MapPin size={16} color={themeColors.text.muted} strokeWidth={2} />
            <Text style={[styles.metaText, { color: themeColors.text.muted }]}>{item.neighborhood || item.location}</Text>
          </View>
          <View style={styles.dateRow}>
            <Calendar size={16} color={themeColors.text.muted} strokeWidth={2} />
            <Text style={[styles.metaText, { color: themeColors.text.muted }]}>{formatDate(item.startDate)}</Text>
          </View>
        </View>

        {/* Hover Button Effect - Always visible on mobile */}
        <View style={[styles.viewDetailsButton, { backgroundColor: themeColors.primary[600] }]}>
          <Text style={styles.viewDetailsText}>Ver detalles</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <>
      {renderHero()}
      {renderHowItWorksClient()}
      {renderHowItWorksWorker()}
      {renderSecurityBanner()}

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <Text style={[styles.tabsLabel, { color: themeColors.text.secondary }]}>Buscar:</Text>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'jobs' && styles.tabActive]}
          onPress={() => setActiveTab('jobs')}
        >
          <Briefcase size={16} color={activeTab === 'jobs' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: themeColors.text.secondary }, activeTab === 'jobs' && styles.tabTextActive]}>
            Trabajos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <User size={16} color={activeTab === 'users' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: themeColors.text.secondary }, activeTab === 'users' && styles.tabTextActive]}>
            Perfiles
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Filters */}
      {renderSearchAndFilters()}

      {/* Protection Banner */}
      <View style={[styles.protectionBanner, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
        <View style={styles.protectionIconContainer}>
          <Lock size={20} color={themeColors.primary[600]} strokeWidth={2} />
        </View>
        <View style={styles.protectionContent}>
          <Text style={[styles.protectionTitle, { color: themeColors.text.primary }]}>
            En Doers, cada contrato queda protegido:
          </Text>
          <Text style={[styles.protectionText, { color: themeColors.text.secondary }]}>
            el dinero se mantiene en garantía hasta que ambas partes confirman que el trabajo fue entregado. Así, vos y el profesional están seguros en todo momento.
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Trabajos Disponibles</Text>
    </>
  );

  const renderFooter = () => {
    // Footer matching web design
    return (
      <View style={styles.footer}>
        {hasMore && (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color={colors.primary[500]} />
          </View>
        )}

        <Text style={styles.footerBrand}>DOAPP</Text>
        <Text style={styles.footerDescription}>
          La plataforma de freelancing más confiable de Argentina.{'\n'}
          Conectamos talento con oportunidades.
        </Text>

        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>Pagos procesados de forma segura:</Text>
          <View style={styles.paymentLogos}>
            {/* MercadoPago Logo */}
            <View style={styles.mpLogoContainer}>
              <Svg width={120} height={32} viewBox="0 0 340 90">
                <G>
                  <Path d="M170,8.3c-22.6,0-41,18.4-41,41s18.4,41,41,41s41-18.4,41-41S192.6,8.3,170,8.3z M170,82.3c-18.2,0-33-14.8-33-33s14.8-33,33-33s33,14.8,33,33S188.2,82.3,170,82.3z" fill="#009EE3"/>
                  <Path d="M170,16.3c-18.2,0-33,14.8-33,33c0,8.5,3.2,16.2,8.5,22c-0.1-0.5-0.2-1-0.2-1.5c0-12.1,11-30.5,24.7-30.5c8.6,0,13.1,5.8,13.1,13.3c0,15.5-16.2,23.7-16.2,23.7c4.5,3.7,7.5,4,11.1,4c14.3,0,25-12.6,25-31C203,31.1,188.2,16.3,170,16.3z" fill="#009EE3"/>
                  <Path d="M22,58.3h8.8l2.6-16.5h8.8l-2.6,16.5h8.8l3.5-22.2c0.3-1.8-1.1-3.4-2.9-3.4H27.4c-1.5,0-2.8,1.1-3,2.6L22,58.3z" fill="#2D3277"/>
                  <Path d="M55,58.3h8.8l3.5-22.2c0.3-1.8-1.1-3.4-2.9-3.4h-8.8c-1.5,0-2.8,1.1-3,2.6l-1.1,6.5h8.8L55,58.3z" fill="#2D3277"/>
                  <Path d="M77.5,32.7H65.1c-1.5,0-2.8,1.1-3,2.6L58.6,58.3h8.8l1.3-8.2h5.7c6.5,0,11.3-4.4,12.1-10.8C87.3,33.6,82.5,32.7,77.5,32.7z M76.7,43.8h-4.5l1-6.5h4.5c2,0,3.1,0.8,2.8,3C80.2,42.5,78.6,43.8,76.7,43.8z" fill="#2D3277"/>
                  <Path d="M260,32.7h-12.4c-1.5,0-2.8,1.1-3,2.6l-3.5,22.9h8.8l1.3-8.2h5.7c6.5,0,11.3-4.4,12.1-10.8C269.8,33.6,265,32.7,260,32.7z M259.2,43.8h-4.5l1-6.5h4.5c2,0,3.1,0.8,2.8,3C262.7,42.5,261.1,43.8,259.2,43.8z" fill="#2D3277"/>
                  <Path d="M230,32.7h-8.8c-1.5,0-2.8,1.1-3,2.6l-3.5,22.9h8.8l1.5-9.5c0.2-1.1,1.1-1.8,2.2-1.8h2.4c6.5,0,11.3-4.4,12.1-10.8C242.3,33.6,235,32.7,230,32.7z" fill="#2D3277"/>
                  <Path d="M100.8,32.7H89.5c-1.5,0-2.8,1.1-3,2.6l-3.5,22.9h8.8l1-6.5h4.5c6.5,0,12.1-4.9,12.8-11.3C111,34.5,106.3,32.7,100.8,32.7z M99.5,44.6h-3.8l0.8-5.7h4c1.8,0,2.7,0.7,2.5,2.6C102.7,43.5,101.2,44.6,99.5,44.6z" fill="#2D3277"/>
                  <Path d="M286,44.1c0,0,4.2-2.7,4.2-7.5c0-3.8-3.3-3.9-3.3-3.9h-14.3c-1.5,0-2.8,1.1-3,2.6l-3.5,22.9h9.3l1-6.5h2.1l3.7,6.5h10.3L286,44.1z M282.1,44.1h-3.5l0.8-5.3h3.7c1.3,0,2.2,0.5,2,2.2C285,42.9,283.7,44.1,282.1,44.1z" fill="#2D3277"/>
                  <Path d="M119.5,32.7l-3.5,22.2c-0.3,1.8,1.1,3.4,2.9,3.4h12.3c1.5,0,2.8-1.1,3-2.6l3.5-22.9h-8.8l-2.6,17.3h-3.1l2.6-17.3H119.5z" fill="#2D3277"/>
                </G>
              </Svg>
            </View>
            {/* Bitcoin / Cripto Logo */}
            <View style={[styles.paymentMethodBadge, { backgroundColor: '#fff7ed', borderColor: '#fdba74' }]}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#f7931a"/>
                <Path d="M15.5 10.2c.2-1.4-0.8-2.1-2.3-2.6l.5-1.9-1.1-.3-.4 1.8c-.3-.1-.6-.1-.9-.2l.4-1.8-1.1-.3-.5 1.9c-.2-.1-.5-.1-.7-.2l-1.5-.4-.3 1.2s.8.2.8.2c.5.1.5.4.5.7l-.5 2.2c0 0 .1 0 .1 0l-.1 0-.7 3c-.1.2-.2.4-.6.3 0 0-.8-.2-.8-.2l-.6 1.3 1.4.4c.3.1.5.1.8.2l-.5 1.9 1.1.3.5-1.9c.3.1.6.2.9.2l-.5 1.9 1.1.3.5-1.9c2 .4 3.5.2 4.1-1.6.5-1.4 0-2.3-1.1-2.8.8-.2 1.3-.7 1.5-1.8zm-2.7 3.8c-.4 1.4-2.7.7-3.5.5l.6-2.5c.8.2 3.3.6 2.9 2zm.4-3.8c-.3 1.3-2.3.6-2.9.5l.6-2.3c.7.2 2.7.5 2.3 1.8z" fill="#fff"/>
              </Svg>
              <Text style={[styles.paymentMethodText, { color: '#f97316' }]}>Cripto</Text>
            </View>
            {/* Transferencia */}
            <View style={[styles.paymentMethodBadge, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
              <Text style={[styles.paymentMethodText, { color: '#16a34a' }]}>Transferencia</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading && jobs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={styles.loadingText}>Cargando trabajos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Top Auth Bar */}
      {!isAuthenticated && (
        <View style={[styles.topAuthBar, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            {isDarkMode ? (
              <Sun size={20} color={themeColors.text.secondary} strokeWidth={2} />
            ) : (
              <Moon size={20} color={themeColors.text.secondary} strokeWidth={2} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topLoginButton, { borderColor: themeColors.primary[600] }]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={[styles.topLoginText, { color: themeColors.primary[600] }]}>Iniciar Sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topRegisterButton, { backgroundColor: themeColors.primary[600] }]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.topRegisterText}>Registrarse</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={jobs}
        renderItem={renderJob}
        keyExtractor={(item) => item._id || item.id || String(Math.random())}
        contentContainerStyle={[styles.listContent, { backgroundColor: themeColors.background }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[themeColors.primary[600]]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.background }]}>
            <Package size={48} color={themeColors.text.muted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>No hay trabajos disponibles</Text>
            <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>
              {(searchQuery || activeFilterCount > 0) ? 'Probá con otros filtros de búsqueda' : 'Vuelve a intentar más tarde'}
            </Text>
            {(searchQuery || activeFilterCount > 0) && (
              <TouchableOpacity onPress={clearAllFilters} style={[styles.clearAllBtn, { borderColor: themeColors.primary[600] }]}>
                <Text style={[styles.clearAllBtnText, { color: themeColors.primary[600] }]}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  // Top Auth Bar
  topAuthBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  themeToggle: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 'auto',
  },
  topLoginButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  topLoginText: {
    color: colors.primary[600],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  topRegisterButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
  },
  topRegisterText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
  },
  tabsLabel: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    fontWeight: fontWeight.medium,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.primary[50],
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    fontWeight: fontWeight.medium,
  },
  tabTextActive: {
    color: colors.primary[600],
    fontWeight: fontWeight.semibold,
  },
  // Search & Filters
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    height: '100%',
  },
  tagsScroll: {
    marginTop: spacing.sm,
  },
  tagsContainer: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'capitalize',
  },
  filtersToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  filtersToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  filtersToggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  filterBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearFiltersText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  filtersPanel: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  filterField: {
    position: 'relative',
    zIndex: 10,
  },
  filterLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 42,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  pickerBtnText: {
    fontSize: fontSize.sm,
  },
  pickerDropdown: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: 4,
    maxHeight: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 999,
  },
  pickerScrollView: {
    maxHeight: 200,
  },
  pickerOption: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerOptionText: {
    fontSize: fontSize.sm,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  budgetInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  budgetInput: {
    flex: 1,
    height: 42,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
  },
  budgetSeparator: {
    fontSize: fontSize.base,
  },
  clearAllBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  clearAllBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  // Protection Banner
  protectionBanner: {
    flexDirection: 'row',
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary[100],
    gap: spacing.sm,
  },
  protectionIconContainer: {
    paddingTop: 2,
  },
  protectionContent: {
    flex: 1,
  },
  protectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary[900],
    marginBottom: 2,
  },
  protectionText: {
    fontSize: fontSize.xs,
    color: colors.primary[700],
    lineHeight: 16,
  },
  listContent: {
    padding: spacing.lg,
  },
  // Hero Section
  heroSection: {
    marginBottom: spacing.xl,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    borderRadius: borderRadius.xl,
  },
  logoContainer: {
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 38,
  },
  heroTitleAccent: {
    color: colors.primary[600],
  },
  heroSubtitle: {
    fontSize: fontSize.base,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  heroSmallText: {
    fontSize: fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  heroButtons: {
    width: '100%',
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  secondaryButton: {
    backgroundColor: colors.secondary[500],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  // How It Works
  howItWorksCard: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  howItWorksTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  howItWorksSubtitle: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  stepsGrid: {
    gap: spacing.md,
  },
  stepsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepGridItem: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    position: 'relative',
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    position: 'absolute',
    top: -4,
    left: '25%',
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  stepTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  stepDescription: {
    fontSize: fontSize.xs,
    color: colors.slate[600],
    textAlign: 'center',
  },
  // Security Banner
  securityBanner: {
    flexDirection: 'row',
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  securityIconContainer: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary[900],
    marginBottom: spacing.xs,
  },
  securityText: {
    fontSize: fontSize.xs,
    color: colors.primary[700],
    lineHeight: 18,
  },
  // Section Title
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.lg,
  },
  // Job Card
  jobCard: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
    overflow: 'hidden',
  },
  priceBadge: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  priceText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  jobTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
    paddingRight: 80,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  ratingText: {
    fontSize: fontSize.xs,
    color: colors.slate[600],
  },
  jobDescription: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  jobFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.slate[500],
  },
  viewDetailsButton: {
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginHorizontal: -spacing.lg,
    marginBottom: -spacing.lg,
    alignItems: 'center',
  },
  viewDetailsText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.base,
    color: colors.slate[500],
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  // Footer
  footer: {
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['4xl'],
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    marginTop: spacing.xl,
  },
  footerBrand: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.md,
  },
  footerDescription: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  paymentSection: {
    alignItems: 'center',
    width: '100%',
  },
  paymentTitle: {
    fontSize: fontSize.xs,
    color: colors.slate[500],
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  paymentLogos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mpLogoContainer: {
    backgroundColor: '#00AAEF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  paymentMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 2,
  },
  paymentMethodText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
