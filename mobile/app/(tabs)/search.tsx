import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, MapPin, Briefcase, Users, Lock, Sun, Moon } from 'lucide-react-native';
import { Job } from '../../types';
import { getJobs, getCategories } from '../../services/jobs';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

type SearchTab = 'jobs' | 'users';

export default function SearchScreen() {
  const router = useRouter();
  const { isDarkMode, toggleTheme, colors: themeColors } = useTheme();

  const [activeTab, setActiveTab] = useState<SearchTab>('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = getCategories();

  const searchJobs = useCallback(async (query: string, category?: string) => {
    setLoading(true);
    try {
      const response = await getJobs({
        search: query,
        category: category || undefined,
        status: 'open',
        limit: 20,
      });

      if (response.success && response.data) {
        setJobs(response.data);
      }
    } catch (error) {
      console.error('Error searching jobs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search when query or category changes
  useEffect(() => {
    if (searchQuery.trim() || selectedCategory) {
      const timer = setTimeout(() => {
        searchJobs(searchQuery, selectedCategory || undefined);
      }, 500); // Debounce 500ms
      return () => clearTimeout(timer);
    } else {
      setJobs([]);
    }
  }, [searchQuery, selectedCategory, searchJobs]);

  const handleCategorySelect = (category: string) => {
    const newCategory = selectedCategory === category ? null : category;
    setSelectedCategory(newCategory);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const renderJob = ({ item }: { item: Job }) => (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      onPress={() => router.push(`/job/${item._id || item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.jobHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
          <Text style={[styles.categoryBadgeText, { color: themeColors.primary[600] }]}>{item.category}</Text>
        </View>
        <Text style={[styles.jobPrice, { color: themeColors.primary[600] }]}>{formatPrice(item.budget || item.price)}</Text>
      </View>
      <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>{item.title}</Text>
      <View style={styles.locationRow}>
        <MapPin size={14} color={themeColors.text.muted} strokeWidth={2} />
        <Text style={[styles.locationText, { color: themeColors.text.secondary }]}>{item.neighborhood || item.location}</Text>
      </View>
    </TouchableOpacity>
  );

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: {
      backgroundColor: themeColors.background,
    },
    searchBarTop: {
      backgroundColor: themeColors.card,
      borderBottomColor: themeColors.border,
    },
    searchInput: {
      backgroundColor: themeColors.slate[50],
      borderColor: themeColors.slate[200],
      color: themeColors.text.primary,
    },
    tabsContainer: {
      backgroundColor: themeColors.card,
      borderBottomColor: themeColors.border,
    },
    text: {
      color: themeColors.text.primary,
    },
    textSecondary: {
      color: themeColors.text.secondary,
    },
    card: {
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
    },
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Search Bar - moved to top */}
      <View style={[styles.searchBarTop, dynamicStyles.searchBarTop]}>
        <TextInput
          style={[styles.searchInputTop, dynamicStyles.searchInput]}
          placeholder="Buscar por título, descripción, palabras clave..."
          placeholderTextColor={themeColors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <X size={18} color={themeColors.text.muted} strokeWidth={2} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.themeToggle, dynamicStyles.searchInput]}
          onPress={toggleTheme}
        >
          {isDarkMode ? (
            <Sun size={20} color={themeColors.text.secondary} strokeWidth={2} />
          ) : (
            <Moon size={20} color={themeColors.text.secondary} strokeWidth={2} />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, dynamicStyles.searchInput]}>
          <View style={styles.filterIcon}>
            <View style={[styles.filterLine, { backgroundColor: themeColors.text.muted }]} />
            <View style={[styles.filterLine, { backgroundColor: themeColors.text.muted }]} />
            <View style={[styles.filterLine, { backgroundColor: themeColors.text.muted }]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, dynamicStyles.tabsContainer]}>
        <Text style={[styles.tabsLabel, dynamicStyles.textSecondary]}>Buscar:</Text>
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
          <Users size={16} color={activeTab === 'users' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: themeColors.text.secondary }, activeTab === 'users' && styles.tabTextActive]}>
            Usuarios
          </Text>
        </TouchableOpacity>
      </View>

      {/* Protection Message */}
      <View style={[styles.protectionBanner, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
        <View style={styles.protectionIconContainer}>
          <Lock size={20} color={themeColors.primary[600]} strokeWidth={2} />
        </View>
        <View style={styles.protectionContent}>
          <Text style={[styles.protectionTitle, dynamicStyles.text]}>
            En Doers, cada contrato queda protegido:
          </Text>
          <Text style={[styles.protectionText, dynamicStyles.textSecondary]}>
            el dinero se mantiene en garantía hasta que ambas partes confirman que el trabajo fue entregado. Así, vos y el profesional están seguros en todo momento.
          </Text>
        </View>
      </View>

      {/* Categories */}
      <View style={[styles.categoriesWrapper, { backgroundColor: themeColors.background }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryChip,
                { backgroundColor: themeColors.slate[100], borderColor: themeColors.border },
                selectedCategory === category && styles.categoryChipSelected,
              ]}
              onPress={() => handleCategorySelect(category)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  { color: themeColors.text.secondary },
                  selectedCategory === category && styles.categoryChipTextSelected,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Results */}
      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
        </View>
      ) : jobs.length > 0 ? (
        <FlatList
          data={jobs}
          renderItem={renderJob}
          keyExtractor={(item) => item._id || item.id || String(Math.random())}
          contentContainerStyle={[styles.resultsContent, { backgroundColor: themeColors.background }]}
          showsVerticalScrollIndicator={false}
        />
      ) : searchQuery || selectedCategory ? (
        <View style={[styles.emptyContainer, { backgroundColor: themeColors.background }]}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={[styles.emptyTitle, dynamicStyles.text]}>No encontramos resultados</Text>
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>Probá con otros términos o categorías</Text>
        </View>
      ) : (
        <View style={[styles.emptyContainer, { backgroundColor: themeColors.background }]}>
          <Text style={styles.emptyIcon}>💡</Text>
          <Text style={[styles.emptyTitle, dynamicStyles.text]}>Buscá trabajos</Text>
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            Ingresá una palabra clave o seleccioná una categoría
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  // Search Bar Top
  searchBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.sm,
  },
  searchInputTop: {
    flex: 1,
    height: 44,
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text.primary.light,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  clearButton: {
    position: 'absolute',
    right: 120,
    padding: spacing.sm,
  },
  themeToggle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  filterButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterIcon: {
    gap: 3,
  },
  filterLine: {
    width: 16,
    height: 2,
    backgroundColor: colors.slate[400],
    borderRadius: 1,
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
  categoriesWrapper: {
    backgroundColor: colors.card.light,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  categoriesContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  categoryChip: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary[500],
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    fontWeight: fontWeight.medium,
  },
  categoryChipTextSelected: {
    color: '#fff',
  },
  resultsContent: {
    padding: spacing.lg,
  },
  jobCard: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  categoryBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary[700],
    fontWeight: fontWeight.semibold,
  },
  jobPrice: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.success[500],
  },
  jobTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary.light,
    marginBottom: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: fontSize.sm,
    marginRight: spacing.xs,
  },
  locationText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['3xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary.light,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary.light,
    textAlign: 'center',
  },
});
