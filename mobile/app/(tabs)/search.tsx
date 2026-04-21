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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, MapPin, Briefcase, Users, Star } from 'lucide-react-native';
import { Job } from '../../types';
import { getJobs, getCategories } from '../../services/jobs';
import { get } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

type SearchTab = 'jobs' | 'users';

interface UserResult {
  id: string;
  _id: string;
  name: string;
  username?: string;
  avatar?: string;
  bio?: string;
  rating?: number;
  reviewsCount?: number;
  completedJobs?: number;
  membershipTier?: string;
  hasMembership?: boolean;
  isPremiumVerified?: boolean;
}

export default function SearchScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  const [activeTab, setActiveTab] = useState<SearchTab>('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = getCategories();

  const searchJobs = useCallback(async (query: string, category?: string) => {
    setLoading(true);
    try {
      const filters: any = { status: 'open', limit: 20 };
      if (query.trim()) filters.query = query;
      if (category) filters.category = category;
      const response = await getJobs(filters);
      const jobsList = (response as any).jobs || response.data || [];
      if (response.success) setJobs(jobsList);
    } catch (error) {
      console.error('Error searching jobs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchUsers = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const response = await get<any>(`/jobs?type=users&query=${encodeURIComponent(query)}&limit=20`);
      if (response.success && response.users) {
        setUsers(response.users);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchJobs('', undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'jobs') {
        searchJobs(searchQuery, selectedCategory || undefined);
      } else {
        searchUsers(searchQuery);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, activeTab, searchJobs, searchUsers]);

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    setSelectedCategory(null);
    setSearchQuery('');
    if (tab === 'users') {
      searchUsers('');
    } else {
      searchJobs('', undefined);
    }
  };

  const handleCategorySelect = (category: string) => {
    const newCategory = selectedCategory === category ? null : category;
    setSelectedCategory(newCategory);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(price);

  const renderJob = ({ item }: { item: Job }) => (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      onPress={() => router.push(`/job/${item._id || item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.jobHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary[50] }]}>
          <Text style={[styles.categoryBadgeText, { color: themeColors.primary[600] }]}>{item.category}</Text>
        </View>
        <Text style={[styles.jobPrice, { color: themeColors.primary[600] }]}>{formatPrice(item.budget || item.price)}</Text>
      </View>
      <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>{item.title}</Text>
      <View style={styles.locationRow}>
        <MapPin size={13} color={themeColors.text.muted} strokeWidth={2} />
        <Text style={[styles.locationText, { color: themeColors.text.secondary }]}>{item.neighborhood || item.location}</Text>
      </View>
      <View style={[styles.viewDetailsBtn, { backgroundColor: themeColors.primary[600] }]}>
        <Text style={styles.viewDetailsBtnText}>Ver detalles</Text>
      </View>
    </TouchableOpacity>
  );

  const renderUser = ({ item }: { item: UserResult }) => (
    <TouchableOpacity
      style={[styles.userCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      onPress={() => router.push(`/user/${item.id || item._id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.userAvatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
        ) : (
          <View style={[styles.userAvatarFallback, { backgroundColor: themeColors.primary[100] }]}>
            <Text style={[styles.userAvatarFallbackText, { color: themeColors.primary[600] }]}>
              {item.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={[styles.userName, { color: themeColors.text.primary }]} numberOfLines={1}>{item.name}</Text>
          {item.hasMembership && (
            <View style={[styles.membershipBadge, { backgroundColor: colors.warning[100] }]}>
              <Text style={[styles.membershipBadgeText, { color: colors.warning[700] }]}>PRO</Text>
            </View>
          )}
        </View>
        {item.bio ? (
          <Text style={[styles.userBio, { color: themeColors.text.secondary }]} numberOfLines={2}>{item.bio}</Text>
        ) : null}
        <View style={styles.userStats}>
          {item.rating ? (
            <View style={styles.ratingRow}>
              <Star size={13} color={colors.warning[500]} fill={colors.warning[500]} strokeWidth={2} />
              <Text style={[styles.ratingText, { color: themeColors.text.secondary }]}>{Number(item.rating).toFixed(1)}</Text>
            </View>
          ) : null}
          {item.completedJobs ? (
            <Text style={[styles.jobsText, { color: themeColors.text.muted }]}>{item.completedJobs} trabajos</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Search Bar */}
      <View style={[styles.searchBarTop, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <View style={[styles.searchInputWrap, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border }]}>
          <TextInput
            style={[styles.searchInputTop, { color: themeColors.text.primary }]}
            placeholder={activeTab === 'jobs' ? 'Buscar trabajos...' : 'Buscar usuarios por nombre...'}
            placeholderTextColor={themeColors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <X size={16} color={themeColors.text.muted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <Text style={[styles.tabsLabel, { color: themeColors.text.secondary }]}>Buscar:</Text>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'jobs' && { backgroundColor: themeColors.primary[50] }]}
          onPress={() => handleTabChange('jobs')}
        >
          <Briefcase size={16} color={activeTab === 'jobs' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: activeTab === 'jobs' ? themeColors.primary[600] : themeColors.text.secondary }, activeTab === 'jobs' && { fontWeight: fontWeight.semibold }]}>
            Trabajos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && { backgroundColor: themeColors.primary[50] }]}
          onPress={() => handleTabChange('users')}
        >
          <Users size={16} color={activeTab === 'users' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: activeTab === 'users' ? themeColors.primary[600] : themeColors.text.secondary }, activeTab === 'users' && { fontWeight: fontWeight.semibold }]}>
            Usuarios
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category chips — only for jobs tab */}
      {activeTab === 'jobs' && (
        <View style={[styles.categoriesWrapper, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContainer}
          >
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryChip,
                  { backgroundColor: themeColors.slate[100], borderColor: themeColors.border },
                  selectedCategory === category.id && { backgroundColor: colors.primary[500], borderColor: colors.primary[500] },
                ]}
                onPress={() => handleCategorySelect(category.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: selectedCategory === category.id ? '#fff' : themeColors.text.secondary },
                  ]}
                >
                  {category.icon} {category.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Results */}
      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
        </View>
      ) : activeTab === 'jobs' ? (
        jobs.length > 0 ? (
          <FlatList
            data={jobs}
            renderItem={renderJob}
            keyExtractor={(item) => item._id || item.id || String(Math.random())}
            contentContainerStyle={[styles.resultsContent, { backgroundColor: themeColors.background }]}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.background }]}>
            <Text style={styles.emptyIcon}>{searchQuery || selectedCategory ? '🔍' : '💡'}</Text>
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              {searchQuery || selectedCategory ? 'No encontramos resultados' : 'No hay trabajos disponibles'}
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>
              {searchQuery || selectedCategory ? 'Probá con otros términos o categorías' : 'Volvé a intentar más tarde'}
            </Text>
          </View>
        )
      ) : (
        users.length > 0 ? (
          <FlatList
            data={users}
            renderItem={renderUser}
            keyExtractor={(item) => item.id || item._id || String(Math.random())}
            contentContainerStyle={[styles.resultsContent, { backgroundColor: themeColors.background }]}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.background }]}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              {searchQuery ? 'No encontramos usuarios' : 'Buscá por nombre de usuario'}
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>
              {searchQuery ? 'Probá con otros términos' : 'Escribí un nombre para buscar profesionales'}
            </Text>
          </View>
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  searchInputTop: {
    flex: 1,
    fontSize: fontSize.sm,
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  tabsLabel: {
    fontSize: fontSize.sm,
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
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  categoriesWrapper: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  categoriesContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.xs,
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  resultsContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  // Job card
  jobCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  categoryBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  jobPrice: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  jobTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  locationText: {
    fontSize: fontSize.sm,
  },
  viewDetailsBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  viewDetailsBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // User card
  userCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  userAvatarContainer: {
    position: 'relative',
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  userAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarFallbackText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  userName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  membershipBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  membershipBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  userBio: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  jobsText: {
    fontSize: fontSize.xs,
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
  emptyIcon: { fontSize: 48, marginBottom: spacing.lg },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
