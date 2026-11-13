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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PlusCircle, MessageCircle, Lock, CheckCircle, MapPin, Calendar, Star, Package, Briefcase, User, Sun, Moon, Search, ArrowRight, Filter, X, DollarSign, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Job } from '../../types';
import { getJobs, getCategories } from '../../services/jobs';
import { useAuth } from '../../context/AuthContext';
import { mostrarRating } from '../../../shared/rating/display';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import Svg, { Path, Rect, G, Defs, ClipPath } from 'react-native-svg';
import Logo from '../../components/ui/Logo';
import LocationAutocomplete from '../../components/ui/LocationAutocomplete';
import MediosDePago from '../../components/ui/MediosDePago';
import { parametrosParaMi, tieneAlgoParaMi, etiquetaDeRubro } from '../../../shared/perfiles/zonaDeTrabajo';

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
  // «Para mí»: solo los trabajos de mis rubros y mi zona (igual que en la web).
  const [paraMi, setParaMi] = useState(false);
  const esTrabajadorConDatos = !!user && ((user as any).role === 'doer' || (user as any).role === 'both') && tieneAlgoParaMi(user as any);
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
    if (paraMi && esTrabajadorConDatos) Object.assign(filters, parametrosParaMi(user as any));
    return filters;
  }, [searchQuery, filterLocation, filterCategory, filterMinBudget, filterMaxBudget, filterSortBy, selectedTag, paraMi, esTrabajadorConDatos, user]);

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
          : 'Changas, arreglos y trabajos de todo tipo, con todo acordado por escrito. El trabajo se termina y el pago llega.'}
      </Text>

      {!user && (
        <Text style={[styles.heroSmallText, { color: themeColors.text.muted }]}>
          Publicá lo que necesitás o encontrá trabajos: lo que se acuerda queda por escrito, tu pago queda guardado en DOAPP y se libera cuando el trabajo está terminado.
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

  const HowItWorksStep = ({ icon, color, num, numColor, title, desc }: { icon: React.ReactNode; color: string; num: string; numColor: string; title: string; desc: string }) => (
    <View style={styles.stepCompact}>
      <View style={[styles.stepIconCompact, { backgroundColor: color }]}>
        {icon}
        <View style={[styles.stepNumberCompact, { backgroundColor: numColor }]}>
          <Text style={styles.stepNumberText}>{num}</Text>
        </View>
      </View>
      <Text style={[styles.stepTitleCompact, { color: themeColors.text.primary }]}>{title}</Text>
      <Text style={[styles.stepDescCompact, { color: themeColors.text.secondary }]}>{desc}</Text>
    </View>
  );

  const renderHowItWorksClient = () => (
    <View style={[styles.howItWorksCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.howItWorksTitle, { color: themeColors.text.primary }]}>¿Necesitás un servicio?</Text>
      <Text style={[styles.howItWorksSubtitle, { color: themeColors.text.secondary }]}>Publicá tu trabajo y encontrá profesionales</Text>
      <View style={styles.stepsRowCompact}>
        <HowItWorksStep icon={<PlusCircle size={20} color="#fff" strokeWidth={2} />} color={colors.primary[500]} num="1" numColor={colors.primary[700]} title="Publicá" desc="Detallá lo que necesitás" />
        <HowItWorksStep icon={<MessageCircle size={20} color="#fff" strokeWidth={2} />} color={colors.secondary[500]} num="2" numColor={colors.secondary[700]} title="Elegí" desc="Recibí propuestas" />
        <HowItWorksStep icon={<Lock size={20} color="#fff" strokeWidth={2} />} color="#8b5cf6" num="3" numColor="#6d28d9" title="Pagá Seguro" desc="Dinero en garantía" />
        <HowItWorksStep icon={<CheckCircle size={20} color="#fff" strokeWidth={2} />} color={colors.success[500]} num="4" numColor={colors.success[700]} title="¡Listo!" desc="Pago liberado" />
      </View>
    </View>
  );

  const renderHowItWorksWorker = () => (
    <View style={[styles.howItWorksCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.howItWorksTitle, { color: themeColors.text.primary }]}>¿Ofrecés servicios?</Text>
      <Text style={[styles.howItWorksSubtitle, { color: themeColors.text.secondary }]}>Encontrá trabajos y empezá a ganar</Text>
      <View style={styles.stepsRowCompact}>
        <HowItWorksStep icon={<Search size={20} color="#fff" strokeWidth={2} />} color={colors.primary[500]} num="1" numColor={colors.primary[700]} title="Buscá" desc="Encontrá oportunidades" />
        <HowItWorksStep icon={<MessageCircle size={20} color="#fff" strokeWidth={2} />} color={colors.secondary[500]} num="2" numColor={colors.secondary[700]} title="Aplicá" desc="Enviá tu propuesta" />
        <HowItWorksStep icon={<Briefcase size={20} color="#fff" strokeWidth={2} />} color="#8b5cf6" num="3" numColor="#6d28d9" title="Trabajá" desc="Con tranquilidad" />
        <HowItWorksStep icon={<CheckCircle size={20} color="#fff" strokeWidth={2} />} color={colors.success[500]} num="4" numColor={colors.success[700]} title="Cobrá" desc="Pago garantizado" />
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

        {/* !!: con la búsqueda vacía esto devolvía "" y un texto suelto dentro de un View rompe la pantalla en la app nativa */}
        {(activeFilterCount > 0 || !!searchQuery) && (
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
                      key={cat.id}
                      style={[styles.pickerOption, { borderBottomColor: themeColors.border }, filterCategory === cat.id && { backgroundColor: themeColors.primary[50] }]}
                      onPress={() => { setFilterCategory(cat.id); setShowCategoryPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, { color: filterCategory === cat.id ? themeColors.primary[600] : themeColors.text.primary }]}>
                        {cat.icon} {cat.label}
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
        onPress={() => router.push(`/job/${item.id || item.id}`)}
        activeOpacity={0.7}
      >
        {/* Rubro y precio, como en la web */}
        <View style={styles.jobCardTop}>
          {!!item.category && (
            <View style={[styles.categoriaChip, { backgroundColor: themeColors.primary[50] }]}>
              <Text style={[styles.categoriaChipTexto, { color: themeColors.primary[700] }]}>{etiquetaDeRubro(String(item.category))}</Text>
            </View>
          )}
          <View style={[styles.priceBadge, { backgroundColor: colors.primary[600], alignSelf: 'auto', marginBottom: 0 }]}>
            <Text style={[styles.priceText, { color: '#fff' }]}>{formatPrice(item.budget || item.price)}</Text>
          </View>
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
              {mostrarRating(client.rating, client.reviewsCount).texto}{mostrarRating(client.rating, client.reviewsCount).tieneCalificacion ? ` (${client.reviewsCount || 0})` : ""}
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

        {/* Ver detalles button */}
        <View style={[styles.viewDetailsButton, { backgroundColor: themeColors.primary[600] }]}>
          <Text style={styles.viewDetailsText}>Ver detalles</Text>
          <ArrowRight size={14} color="#fff" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  /** Barra de arriba de quien ya ingresó (como el encabezado de la web): la marca, la etiqueta de la beta, lo que tiene sin comisión y el tema. */
  const renderBarraLogueada = () => {
    const libres = Number((user as any)?.freeContractsRemaining) || 0;
    const familia = !!(user as any)?.hasFamilyPlan;
    return (
      <View style={[styles.barraLogueada, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <Logo size="small" />
        {!!(user as any)?.platform?.isBeta && (
          <View style={styles.etiquetaBeta}><Text style={styles.etiquetaBetaTexto}>BETA</Text></View>
        )}
        <View style={{ flex: 1 }} />
        {(familia || libres > 0) && (
          <View style={[styles.chipSinComision, familia && { backgroundColor: '#fdf2f8', borderColor: '#f9a8d4' }]}>
            <Text style={[styles.chipSinComisionTexto, familia && { color: '#be185d' }]} numberOfLines={1}>
              {familia ? 'PLAN FAMILIAR · 0% COMISIONES' : `${libres} sin comisión`}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.themeToggle2} onPress={toggleTheme} accessibilityLabel="Cambiar tema">
          {isDarkMode ? <Sun size={20} color={themeColors.text.secondary} strokeWidth={2} /> : <Moon size={20} color={themeColors.text.secondary} strokeWidth={2} />}
        </TouchableOpacity>
      </View>
    );
  };

  /** «Para mí»: el interruptor y qué rubros y zona está usando. */
  const renderParaMi = () => {
    if (!esTrabajadorConDatos) return null;
    const u: any = user;
    const rubros = u.workAnyCategory ? 'cualquier rubro' : (u.workCategories || []).map(etiquetaDeRubro).join(', ');
    const zona = [u.address?.city, ...(u.workZones || []).map((z: any) => z.name)].filter(Boolean).join(', ');
    return (
      <View style={[styles.paraMi, { backgroundColor: themeColors.primary[50], borderColor: themeColors.primary[200] }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.paraMiTitulo, { color: themeColors.primary[700] }]}>Para mí</Text>
          <Text style={[styles.paraMiDetalle, { color: themeColors.text.secondary }]} numberOfLines={2}>
            {rubros || 'Todos los rubros'}{zona ? ` · ${zona}` : ''}{u.workRadiusKm ? ` · hasta ${u.workRadiusKm} km` : ''}
          </Text>
        </View>
        <Switch value={paraMi} onValueChange={setParaMi} trackColor={{ true: colors.primary[500], false: themeColors.border }} accessibilityLabel="Mostrar solo trabajos para mí" />
      </View>
    );
  };

  const renderHeader = () => (
    <>
      {isAuthenticated ? renderBarraLogueada() : (
        <>
          {renderHero()}
          {renderHowItWorksClient()}
          {renderHowItWorksWorker()}
          {renderSecurityBanner()}
        </>
      )}
      {isAuthenticated && !!user && (
        <Text style={[styles.saludo, { color: themeColors.text.primary }]}>¡Hola, {user.name?.split(' ')[0]}!</Text>
      )}
      {isAuthenticated && renderParaMi()}

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

      <Text style={[styles.sectionTitle, { color: themeColors.text.primary, marginTop: spacing.lg }]}>Trabajos Disponibles</Text>
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

        {isAuthenticated && (
          <View style={{ width: '100%', marginBottom: spacing.lg }}>
            {renderHowItWorksClient()}
            {renderHowItWorksWorker()}
          </View>
        )}
        <Text style={styles.footerBrand}>DOAPP</Text>
        <Text style={styles.footerDescription}>
          La plataforma de freelancing más confiable de Argentina.{'\n'}
          Conectamos talento con oportunidades.
        </Text>

        <MediosDePago />
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
        keyExtractor={(item) => item.id || item.id || String(Math.random())}
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
            {(!!searchQuery || activeFilterCount > 0) && (
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
  // Barra de quien ya ingresó (como el encabezado de la web)
  barraLogueada: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  etiquetaBeta: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  etiquetaBetaTexto: { color: '#b45309', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  chipSinComision: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 190 },
  chipSinComisionTexto: { color: '#15803d', fontSize: 11, fontWeight: '700' },
  themeToggle2: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  saludo: { fontSize: 22, fontWeight: '800', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  paraMi: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.xl, borderWidth: 1 },
  paraMiTitulo: { fontSize: 14, fontWeight: '800' },
  paraMiDetalle: { fontSize: 12, marginTop: 2 },
  jobCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  categoriaChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  categoriaChipTexto: { fontSize: 12, fontWeight: '700' },
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
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  howItWorksTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: 2,
  },
  howItWorksSubtitle: {
    fontSize: fontSize.xs,
    color: colors.slate[600],
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  stepsRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  stepCompact: {
    flex: 1,
    alignItems: 'center',
  },
  stepIconCompact: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
    position: 'relative',
  },
  stepNumberCompact: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  stepTitleCompact: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: 1,
  },
  stepDescCompact: {
    fontSize: 10,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 13,
  },
  // kept for old references (unused now)
  stepsGrid: { gap: spacing.md },
  stepsRow: { flexDirection: 'row', gap: spacing.md },
  stepGridItem: { flex: 1, alignItems: 'center', padding: spacing.sm, position: 'relative' },
  stepIcon: { width: 48, height: 48, borderRadius: borderRadius.full, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm },
  stepNumber: { position: 'absolute', top: -4, left: '25%', width: 20, height: 20, borderRadius: borderRadius.full, backgroundColor: colors.primary[600], justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.slate[900], textAlign: 'center', marginBottom: spacing.xs },
  stepDescription: { fontSize: fontSize.xs, color: colors.slate[600], textAlign: 'center' },
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
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
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
