import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Briefcase,
  FileText,
  DollarSign,
  Star,
  Clock,
  CheckCircle,
  BarChart3,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { get } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface DashboardStats {
  jobsPublished: number;
  jobsCompleted: number;
  activeContracts: number;
  completedContracts: number;
  pendingProposals: number;
  totalEarnings: number;
  totalSpent: number;
  averageRating: number;
  totalReviews: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
  balanceBefore: number;
  balanceAfter: number;
  relatedContract?: { price: number; status: string };
  relatedPayment?: { amount: number; status: string };
}

type TransactionModalType = 'earnings' | 'spent' | null;

export default function DashboardScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Transaction modal state
  const [modalType, setModalType] = useState<TransactionModalType>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);

  const fetchStats = async () => {
    try {
      const [contractsRes, proposalsRes, balanceRes] = await Promise.all([
        get<any>('/contracts').catch(() => null),
        get<any>('/proposals?type=sent').catch(() => null),
        get<any>('/balance/summary').catch(() => null),
      ]);

      const contracts = (contractsRes as any)?.contracts || (contractsRes as any)?.data || [];
      const proposals = (proposalsRes as any)?.proposals || (proposalsRes as any)?.data || [];
      // summary endpoint returns { success, summary: {...} }
      const balanceSummary = (balanceRes as any)?.summary || (balanceRes as any)?.data || {};

      const userId = user?.id || (user as any)?._id;

      const activeContracts = Array.isArray(contracts) ? contracts.filter((c: any) =>
        ['accepted', 'in_progress', 'ready'].includes(c.status)
      ).length : 0;

      const completedContracts = Array.isArray(contracts) ? contracts.filter((c: any) =>
        c.status === 'completed'
      ).length : 0;

      const pendingProposals = Array.isArray(proposals) ? proposals.filter((p: any) =>
        p.status === 'pending'
      ).length : 0;

      const earnings = Array.isArray(contracts) ? contracts
        .filter((c: any) => {
          const doerId = typeof c.doer === 'object' ? (c.doer?.id || c.doer?._id) : c.doer;
          return doerId === userId && c.status === 'completed';
        })
        .reduce((sum: number, c: any) => sum + (c.price || 0), 0) : 0;

      const spent = Array.isArray(contracts) ? contracts
        .filter((c: any) => {
          const clientId = typeof c.client === 'object' ? (c.client?.id || c.client?._id) : c.client;
          return clientId === userId && c.status === 'completed';
        })
        .reduce((sum: number, c: any) => sum + (c.totalPrice || c.price || 0), 0) : 0;

      setStats({
        jobsPublished: user?.completedJobs || 0,
        jobsCompleted: user?.completedJobs || 0,
        activeContracts,
        completedContracts,
        pendingProposals,
        totalEarnings: balanceSummary.totalEarnings || balanceSummary.totalRefunds || earnings,
        totalSpent: balanceSummary.totalSpent || balanceSummary.totalPayments || spent,
        averageRating: user?.rating || 5,
        totalReviews: user?.reviewsCount || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const fetchTransactions = useCallback(async (type: 'earnings' | 'spent', offset = 0) => {
    setTxLoading(true);
    try {
      // earnings = refund, bonus, adjustment (positive)
      // spent = payment, withdrawal (negative)
      const txType = type === 'earnings' ? 'refund' : 'payment';
      const res = await get<any>(`/balance/transactions?type=${txType}&limit=20&offset=${offset}`);
      if (res.success) {
        const items = (res as any).transactions || [];
        if (offset === 0) {
          setTransactions(items);
        } else {
          setTransactions(prev => [...prev, ...items]);
        }
        const pagination = (res as any).pagination;
        setTxHasMore(pagination?.hasMore || false);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const openTransactionModal = (type: 'earnings' | 'spent') => {
    setModalType(type);
    setTransactions([]);
    setTxPage(0);
    setTxHasMore(true);
    fetchTransactions(type, 0);
  };

  const loadMoreTransactions = () => {
    if (!txHasMore || txLoading || !modalType) return;
    const nextOffset = txPage + 20;
    setTxPage(nextOffset);
    fetchTransactions(modalType, nextOffset);
  };

  const formatARS = (amount: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'refund': return 'Reembolso';
      case 'payment': return 'Pago';
      case 'bonus': return 'Bonus';
      case 'adjustment': return 'Ajuste';
      case 'withdrawal': return 'Retiro';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success[500];
      case 'pending': return colors.warning[500];
      case 'failed': return colors.danger[500];
      default: return colors.slate[500];
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isPositive = Number(item.amount) > 0;
    const contractId = item.relatedContract ? (item as any).relatedContractId : null;

    return (
      <TouchableOpacity
        style={[styles.txItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => {
          if (contractId) {
            setModalType(null);
            router.push(`/contracts/${contractId}`);
          }
        }}
        activeOpacity={contractId ? 0.7 : 1}
      >
        <View style={[styles.txIcon, { backgroundColor: isPositive ? colors.success[50] : colors.danger[50] }]}>
          {isPositive
            ? <ArrowDownLeft size={18} color={colors.success[500]} />
            : <ArrowUpRight size={18} color={colors.danger[500]} />
          }
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txDesc, { color: themeColors.text.primary }]} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.txMeta}>
            <Text style={[styles.txType, { color: themeColors.text.muted }]}>
              {getTypeLabel(item.type)}
            </Text>
            <View style={[styles.txStatusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.txDate, { color: themeColors.text.muted }]}>
              {formatDate(item.createdAt)} {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
        <View style={styles.txAmountCol}>
          <Text style={[styles.txAmount, { color: isPositive ? colors.success[600] : colors.danger[600] }]}>
            {isPositive ? '+' : ''}{formatARS(Number(item.amount))}
          </Text>
          {contractId && <ChevronRight size={14} color={themeColors.text.muted} />}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Dashboard</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Dashboard</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[600]} />}
      >
        {/* Money Cards - now tappable */}
        <View style={styles.moneyRow}>
          <TouchableOpacity
            style={[styles.moneyCard, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}
            onPress={() => openTransactionModal('earnings')}
            activeOpacity={0.7}
          >
            <View style={styles.moneyCardHeader}>
              <TrendingUp size={20} color={colors.success[600]} />
              <ChevronRight size={16} color={colors.success[400]} />
            </View>
            <Text style={[styles.moneyLabel, { color: colors.success[700] }]}>Ganancias</Text>
            <Text style={[styles.moneyValue, { color: colors.success[700] }]}>
              {formatARS(stats?.totalEarnings || 0)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.moneyCard, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}
            onPress={() => openTransactionModal('spent')}
            activeOpacity={0.7}
          >
            <View style={styles.moneyCardHeader}>
              <TrendingDown size={20} color={colors.danger[600]} />
              <ChevronRight size={16} color={colors.danger[400]} />
            </View>
            <Text style={[styles.moneyLabel, { color: colors.danger[700] }]}>Gastos</Text>
            <Text style={[styles.moneyValue, { color: colors.danger[700] }]}>
              {formatARS(stats?.totalSpent || 0)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Actividad</Text>
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => router.push('/contracts')}
          >
            <View style={[styles.statIconWrap, { backgroundColor: colors.primary[50] }]}>
              <FileText size={18} color={colors.primary[600]} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>{stats?.activeContracts || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>Contratos activos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => router.push('/contracts')}
          >
            <View style={[styles.statIconWrap, { backgroundColor: colors.success[50] }]}>
              <CheckCircle size={18} color={colors.success[600]} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>{stats?.completedContracts || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>Completados</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.warning[50] }]}>
              <Clock size={18} color={colors.warning[600]} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>{stats?.pendingProposals || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>Propuestas pend.</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.secondary[50] }]}>
              <Star size={18} color={colors.secondary[500]} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>
              {Number(stats?.averageRating || 5).toFixed(1)}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>
              Rating ({stats?.totalReviews || 0})
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary, marginTop: spacing.md }]}>Accesos rapidos</Text>
        <View style={[styles.actionsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          {[
            { icon: Briefcase, label: 'Agenda Do', route: '/my-jobs', color: colors.primary[600] },
            { icon: FileText, label: 'Contratos', route: '/contracts', color: colors.success[600] },
            { icon: DollarSign, label: 'Balance', route: '/balance', color: colors.warning[600] },
            { icon: BarChart3, label: 'Pagos', route: '/payments', color: colors.secondary[500] },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              style={styles.actionItem}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '15' }]}>
                <action.icon size={20} color={action.color} />
              </View>
              <Text style={[styles.actionLabel, { color: themeColors.text.primary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Transaction Detail Modal */}
      <Modal
        visible={modalType !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalType(null)}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
          <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity onPress={() => setModalType(null)} style={styles.backButton}>
              <X size={24} color={themeColors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
              {modalType === 'earnings' ? 'Ganancias' : 'Gastos'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Summary header */}
          <View style={[styles.modalSummary, {
            backgroundColor: modalType === 'earnings' ? colors.success[50] : colors.danger[50],
            borderBottomColor: themeColors.border,
          }]}>
            {modalType === 'earnings'
              ? <TrendingUp size={24} color={colors.success[600]} />
              : <TrendingDown size={24} color={colors.danger[600]} />
            }
            <Text style={[styles.modalSummaryValue, {
              color: modalType === 'earnings' ? colors.success[700] : colors.danger[700]
            }]}>
              {formatARS(modalType === 'earnings' ? (stats?.totalEarnings || 0) : (stats?.totalSpent || 0))}
            </Text>
            <Text style={[styles.modalSummaryLabel, {
              color: modalType === 'earnings' ? colors.success[600] : colors.danger[600]
            }]}>
              {modalType === 'earnings' ? 'Total ganado' : 'Total gastado'}
            </Text>
          </View>

          {txLoading && transactions.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <DollarSign size={48} color={themeColors.text.muted} />
              <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
                Sin movimientos
              </Text>
              <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
                No hay {modalType === 'earnings' ? 'ganancias' : 'gastos'} registrados
              </Text>
            </View>
          ) : (
            <FlatList
              data={transactions}
              renderItem={renderTransaction}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.txList}
              onEndReached={loadMoreTransactions}
              onEndReachedThreshold={0.3}
              ListFooterComponent={txLoading ? <ActivityIndicator style={{ padding: spacing.lg }} color={colors.primary[600]} /> : null}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: spacing.lg, paddingBottom: 50 },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  moneyCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  moneyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moneyLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  moneyValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  statLabel: { fontSize: fontSize.xs },
  actionsCard: {
    flexDirection: 'row',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    justifyContent: 'space-around',
  },
  actionItem: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  // Modal
  modalSummary: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  modalSummaryValue: { fontSize: 28, fontWeight: fontWeight.bold },
  modalSummaryLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  // Transactions
  txList: { padding: spacing.md, gap: spacing.sm },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txInfo: { flex: 1 },
  txDesc: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 2 },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  txType: { fontSize: fontSize.xs },
  txStatusDot: { width: 6, height: 6, borderRadius: 3 },
  txDate: { fontSize: fontSize.xs },
  txAmountCol: { alignItems: 'flex-end', gap: 2 },
  txAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center' },
});
