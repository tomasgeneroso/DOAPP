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
import { ArrowLeft, FileText, Calendar, DollarSign, User, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getContracts } from '../../services/contracts';
import { Contract, Job, User as UserType } from '../../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

type TabType = 'as_client' | 'as_worker';

export default function ContractsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user, isAuthenticated } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('as_client');

  const fetchContracts = async () => {
    try {
      const response = await getContracts();
      if (response.success && response.data) {
        setContracts(response.data.contracts);
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchContracts();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchContracts();
  }, [isAuthenticated]);

  const filteredContracts = contracts.filter((contract) => {
    const client = contract.client as UserType;
    const doer = contract.doer as UserType;
    const userId = user?._id || user?.id;

    if (activeTab === 'as_client') {
      return client?._id === userId || client?.id === userId;
    } else {
      return doer?._id === userId || doer?.id === userId;
    }
  });

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
      case 'completed':
        return colors.success[500];
      case 'in_progress':
      case 'accepted':
        return colors.primary[500];
      case 'pending':
      case 'ready':
        return colors.warning[500];
      case 'cancelled':
      case 'disputed':
        return colors.danger[500];
      default:
        return colors.slate[500];
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'Pendiente',
      ready: 'Listo',
      accepted: 'Aceptado',
      in_progress: 'En progreso',
      awaiting_confirmation: 'Esperando confirmación',
      completed: 'Completado',
      cancelled: 'Cancelado',
      disputed: 'En disputa',
    };
    return statusMap[status] || status;
  };

  const renderContract = ({ item }: { item: Contract }) => {
    const job = item.job as Job;
    const client = item.client as UserType;
    const doer = item.doer as UserType;
    const otherPerson = activeTab === 'as_client' ? doer : client;

    return (
      <TouchableOpacity
        style={[styles.contractCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => router.push(`/contracts/${item._id}`)}
      >
        <View style={styles.contractHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
          <ChevronRight size={20} color={themeColors.text.muted} />
        </View>

        <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
          {job?.title || 'Trabajo'}
        </Text>

        <View style={styles.contractInfo}>
          <View style={styles.infoRow}>
            <User size={14} color={themeColors.text.muted} />
            <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
              {activeTab === 'as_client' ? 'Trabajador: ' : 'Cliente: '}
              {otherPerson?.name || 'Usuario'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <DollarSign size={14} color={themeColors.text.muted} />
            <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
              {formatPrice(item.price)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Calendar size={14} color={themeColors.text.muted} />
            <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
              {formatDate(item.startDate)} - {formatDate(item.endDate)}
            </Text>
          </View>
        </View>

        {(item.status === 'awaiting_confirmation') && (
          <View style={[styles.actionBanner, { backgroundColor: colors.warning[50] }]}>
            <Text style={[styles.actionText, { color: colors.warning[600] }]}>
              Requiere tu confirmación
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Mis contratos
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
          Mis contratos
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'as_client' && styles.tabActive]}
          onPress={() => setActiveTab('as_client')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'as_client' ? themeColors.primary[600] : themeColors.text.muted },
            ]}
          >
            Como cliente
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'as_worker' && styles.tabActive]}
          onPress={() => setActiveTab('as_worker')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'as_worker' ? themeColors.primary[600] : themeColors.text.muted },
            ]}
          >
            Como trabajador
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredContracts}
        renderItem={renderContract}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FileText size={48} color={themeColors.text.muted} />
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              No tienes contratos
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
              {activeTab === 'as_client'
                ? 'Cuando contrates a alguien, tus contratos aparecerán aquí'
                : 'Cuando te contraten, tus contratos aparecerán aquí'}
            </Text>
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
  contractCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  contractHeader: {
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
    marginBottom: spacing.md,
  },
  contractInfo: {
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
  actionBanner: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
  },
});
