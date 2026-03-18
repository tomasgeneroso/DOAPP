import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface PaymentItem {
  id: string;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: string;
  payer?: { name: string; avatar?: string };
  recipient?: { name: string; avatar?: string };
  contract?: { id: string; status: string; price: number; job?: { title: string } };
  platformFee?: number;
  workerPaymentAmount?: number;
}

type FilterType = 'all' | 'sent' | 'received';

export default function PaymentsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPayments = async (pageNum = 1, filterType = filter, append = false) => {
    try {
      const res = await get<any>(`/payments/my/list?type=${filterType}&page=${pageNum}&limit=20`);
      if (res.success) {
        let items = (res as any).data || [];
        // Filter out pending payments from "sent" tab - they haven't been sent yet
        if (filterType === 'sent') {
          items = items.filter((p: any) => p.status !== 'pending');
        }
        if (append) {
          setPayments(prev => [...prev, ...items]);
        } else {
          setPayments(items);
        }
        const pagination = (res as any).pagination;
        if (pagination) {
          setHasMore(pageNum < pagination.pages);
        }
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchPayments(1, filter);
  };

  const changeFilter = (f: FilterType) => {
    setFilter(f);
    setPage(1);
    setLoading(true);
    fetchPayments(1, f);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPayments(nextPage, filter, true);
  };

  const formatARS = (amount: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed': return { label: 'Completado', color: colors.success[500], icon: CheckCircle };
      case 'held_escrow': return { label: 'En escrow', color: colors.warning[500], icon: Clock };
      case 'pending': return { label: 'Pendiente', color: colors.warning[500], icon: Clock };
      case 'failed': return { label: 'Fallido', color: colors.danger[500], icon: XCircle };
      case 'refunded': return { label: 'Reembolsado', color: colors.primary[500], icon: ArrowDownLeft };
      default: return { label: status, color: colors.slate[500], icon: Clock };
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'contract_payment': return 'Pago de contrato';
      case 'job_publication': return 'Publicacion de trabajo';
      case 'membership': return 'Membresia';
      case 'escrow_deposit': return 'Deposito escrow';
      case 'escrow_release': return 'Liberacion escrow';
      case 'refund': return 'Reembolso';
      default: return type;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isSent = (item: PaymentItem) => {
    // If we're on the "sent" tab, all items are sent
    if (filter === 'sent') return true;
    // If we're on the "received" tab, all items are received
    if (filter === 'received') return false;
    // On "all" tab, check by payer name match or paymentType (job_publication is always sent)
    const userName = user?.name;
    if (item.paymentType === 'job_publication' || item.paymentType === 'membership') return true;
    if (item.paymentType === 'escrow_release' || item.paymentType === 'refund') return false;
    if (userName && item.payer?.name === userName) return true;
    if (userName && item.recipient?.name === userName) return false;
    return true; // default to sent
  };

  const renderPayment = ({ item }: { item: PaymentItem }) => {
    const statusInfo = getStatusInfo(item.status);
    const StatusIcon = statusInfo.icon;
    const sent = isSent(item);

    return (
      <TouchableOpacity
        style={[styles.paymentItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => {
          if (item.contract?.id) {
            router.push(`/contracts/${item.contract.id}`);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.directionIcon, { backgroundColor: sent ? colors.danger[50] : colors.success[50] }]}>
          {sent ? <ArrowUpRight size={20} color={colors.danger[500]} /> : <ArrowDownLeft size={20} color={colors.success[500]} />}
        </View>

        <View style={styles.paymentInfo}>
          <Text style={[styles.paymentTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
            {item.contract?.job?.title || getPaymentTypeLabel(item.paymentType)}
          </Text>
          <Text style={[styles.paymentSub, { color: themeColors.text.muted }]}>
            {sent ? `Para: ${item.recipient?.name || 'Plataforma'}` : `De: ${item.payer?.name || 'Plataforma'}`}
          </Text>
          <View style={styles.paymentMeta}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15' }]}>
              <StatusIcon size={12} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
            <Text style={[styles.dateText, { color: themeColors.text.muted }]}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        <Text style={[styles.amount, { color: sent ? colors.danger[500] : colors.success[500] }]}>
          {sent ? '-' : '+'}{formatARS(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'sent', label: 'Enviados' },
    { key: 'received', label: 'Recibidos' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Pagos</Text>
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Historial de pagos</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterRow, { borderBottomColor: themeColors.border }]}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && { borderBottomColor: colors.primary[600] }]}
            onPress={() => changeFilter(f.key)}
          >
            <Text style={[styles.filterText, { color: filter === f.key ? colors.primary[600] : themeColors.text.muted }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {payments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <CreditCard size={48} color={themeColors.text.muted} />
          <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>Sin pagos</Text>
          <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
            No tenes pagos registrados
          </Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          renderItem={renderPayment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[600]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: spacing.lg }} color={colors.primary[600]} /> : null}
        />
      )}
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
  filterRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  listContent: { padding: spacing.md, gap: spacing.sm },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  directionIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: { flex: 1 },
  paymentTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 2 },
  paymentSub: { fontSize: fontSize.xs, marginBottom: 4 },
  paymentMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  dateText: { fontSize: fontSize.xs },
  amount: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
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
