import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Briefcase, MapPin, Calendar, DollarSign, ChevronRight, Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getMyJobs, getWorkerJobs } from '../services/jobs';
import { Job } from '../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

type TabType = 'published' | 'applied';

export default function MyJobsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('published');

  const fetchJobs = async () => {
    try {
      const [myJobsRes, workerJobsRes] = await Promise.all([
        getMyJobs(),
        getWorkerJobs(),
      ]);

      if (myJobsRes.success && myJobsRes.data) {
        setPublishedJobs(myJobsRes.data.jobs || []);
      }

      if (workerJobsRes.success && workerJobsRes.data) {
        setAppliedJobs(workerJobsRes.data.jobs || []);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchJobs();
  }, [isAuthenticated]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return colors.success[500];
      case 'in_progress':
        return colors.primary[500];
      case 'completed':
        return colors.slate[500];
      case 'cancelled':
      case 'paused':
        return colors.danger[500];
      default:
        return colors.warning[500];
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      open: 'Abierto',
      in_progress: 'En progreso',
      completed: 'Completado',
      cancelled: 'Cancelado',
      draft: 'Borrador',
      pending_payment: 'Pago pendiente',
      pending_approval: 'En revisión',
      paused: 'Pausado',
      suspended: 'Suspendido',
    };
    return statusMap[status] || status;
  };

  const currentJobs = activeTab === 'published' ? publishedJobs : appliedJobs;

  const renderJob = ({ item }: { item: Job }) => (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      onPress={() => router.push(`/job/${item._id}`)}
    >
      <View style={styles.jobHeader}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
        <ChevronRight size={20} color={themeColors.text.muted} />
      </View>

      <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
        {item.title}
      </Text>

      <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary[50] }]}>
        <Text style={[styles.categoryText, { color: themeColors.primary[600] }]}>
          {item.category}
        </Text>
      </View>

      <View style={styles.jobInfo}>
        <View style={styles.infoRow}>
          <DollarSign size={14} color={themeColors.text.muted} />
          <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
            {formatPrice(item.price || item.budget)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MapPin size={14} color={themeColors.text.muted} />
          <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
            {item.location}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Calendar size={14} color={themeColors.text.muted} />
          <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
            {formatDate(item.startDate)}
            {item.endDate && !item.endDateFlexible ? ` - ${formatDate(item.endDate)}` : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Mis trabajos
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Mis trabajos
        </Text>
        <TouchableOpacity onPress={() => router.push('/create-job')} style={styles.backButton}>
          <Plus size={24} color={themeColors.primary[600]} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'published' && styles.tabActive]}
          onPress={() => setActiveTab('published')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'published' ? themeColors.primary[600] : themeColors.text.muted },
            ]}
          >
            Publicados ({publishedJobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'applied' && styles.tabActive]}
          onPress={() => setActiveTab('applied')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'applied' ? themeColors.primary[600] : themeColors.text.muted },
            ]}
          >
            Aplicados ({appliedJobs.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={currentJobs}
        renderItem={renderJob}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Briefcase size={48} color={themeColors.text.muted} />
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              No tienes trabajos
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
              {activeTab === 'published'
                ? 'Publica tu primer trabajo para encontrar profesionales'
                : 'Aplica a trabajos para comenzar a ganar'}
            </Text>
            {activeTab === 'published' && (
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/create-job')}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.createButtonText}>Publicar trabajo</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary[600],
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  jobCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  jobTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  jobInfo: {
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: {
    fontSize: fontSize.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
