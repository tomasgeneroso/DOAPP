import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle,
  XCircle,
  CreditCard,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getBalance, getTransactions, requestWithdrawal, getWithdrawals } from '../services/balance';
import { BalanceTransaction, WithdrawalRequest } from '../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

type TabType = 'transactions' | 'withdrawals';

export default function BalanceScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const [balance, setBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [cbu, setCbu] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchData = async () => {
    try {
      const [balanceRes, transactionsRes, withdrawalsRes] = await Promise.all([
        getBalance(),
        getTransactions(),
        getWithdrawals(),
      ]);

      if (balanceRes.success && balanceRes.data) {
        setBalance(balanceRes.data.balance || 0);
        setPendingBalance(balanceRes.data.pendingBalance || 0);
      }

      if (transactionsRes.success && transactionsRes.data) {
        setTransactions(transactionsRes.data.transactions || []);
      }

      if (withdrawalsRes.success && withdrawalsRes.data) {
        setWithdrawals(withdrawalsRes.data.withdrawals || []);
      }
    } catch (error) {
      console.error('Error fetching balance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchData();
  }, [isAuthenticated]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);

    if (!amount || amount < 1000) {
      Alert.alert('Error', 'El monto mínimo de retiro es $1,000 ARS');
      return;
    }

    if (amount > balance) {
      Alert.alert('Error', 'No tienes suficiente saldo disponible');
      return;
    }

    if (!cbu || cbu.length !== 22) {
      Alert.alert('Error', 'El CBU debe tener 22 dígitos');
      return;
    }

    setWithdrawing(true);
    try {
      const response = await requestWithdrawal({ amount, cbu });

      if (response.success) {
        Alert.alert('Solicitud enviada', 'Tu solicitud de retiro está siendo procesada');
        setShowWithdrawForm(false);
        setWithdrawAmount('');
        setCbu('');
        fetchData();
      } else {
        Alert.alert('Error', response.message || 'No se pudo procesar el retiro');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setWithdrawing(false);
    }
  };

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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'payment':
        return <ArrowDownLeft size={20} color={colors.success[500]} />;
      case 'withdrawal':
        return <ArrowUpRight size={20} color={colors.danger[500]} />;
      case 'refund':
        return <ArrowDownLeft size={20} color={colors.warning[500]} />;
      default:
        return <Wallet size={20} color={themeColors.text.secondary} />;
    }
  };

  const getWithdrawalStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} color={colors.success[500]} />;
      case 'rejected':
      case 'cancelled':
        return <XCircle size={16} color={colors.danger[500]} />;
      default:
        return <Clock size={16} color={colors.warning[500]} />;
    }
  };

  const getWithdrawalStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Aprobado',
      processing: 'Procesando',
      completed: 'Completado',
      rejected: 'Rechazado',
      cancelled: 'Cancelado',
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Mi balance
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
          Mi balance
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.primary[600] }]}>
          <Text style={styles.balanceLabel}>Saldo disponible</Text>
          <Text style={styles.balanceAmount}>{formatPrice(balance)}</Text>

          {pendingBalance > 0 && (
            <View style={styles.pendingRow}>
              <Clock size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.pendingText}>
                En escrow: {formatPrice(pendingBalance)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={() => setShowWithdrawForm(!showWithdrawForm)}
          >
            <CreditCard size={18} color={colors.primary[600]} />
            <Text style={styles.withdrawButtonText}>Retirar fondos</Text>
          </TouchableOpacity>
        </View>

        {/* Withdraw Form */}
        {showWithdrawForm && (
          <View style={[styles.withdrawForm, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.formTitle, { color: themeColors.text.primary }]}>
              Solicitar retiro
            </Text>

            <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>
              Monto (mínimo $1,000 ARS)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: themeColors.slate[50],
                  borderColor: themeColors.border,
                  color: themeColors.text.primary,
                },
              ]}
              placeholder="Ej: 5000"
              placeholderTextColor={themeColors.text.muted}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>
              CBU (22 dígitos)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: themeColors.slate[50],
                  borderColor: themeColors.border,
                  color: themeColors.text.primary,
                },
              ]}
              placeholder="0000000000000000000000"
              placeholderTextColor={themeColors.text.muted}
              value={cbu}
              onChangeText={setCbu}
              keyboardType="numeric"
              maxLength={22}
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: themeColors.border }]}
                onPress={() => setShowWithdrawForm(false)}
              >
                <Text style={[styles.cancelButtonText, { color: themeColors.text.secondary }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, withdrawing && styles.buttonDisabled]}
                onPress={handleWithdraw}
                disabled={withdrawing}
              >
                {withdrawing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Solicitar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View style={[styles.tabsContainer, { borderColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'transactions' && { borderBottomColor: colors.primary[600] }]}
            onPress={() => setActiveTab('transactions')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'transactions' ? themeColors.primary[600] : themeColors.text.muted },
              ]}
            >
              Transacciones
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'withdrawals' && { borderBottomColor: colors.primary[600] }]}
            onPress={() => setActiveTab('withdrawals')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'withdrawals' ? themeColors.primary[600] : themeColors.text.muted },
              ]}
            >
              Retiros
            </Text>
          </TouchableOpacity>
        </View>

        {/* Transactions List */}
        {activeTab === 'transactions' && (
          <View style={styles.listContainer}>
            {transactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Wallet size={48} color={themeColors.text.muted} />
                <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
                  No hay transacciones
                </Text>
              </View>
            ) : (
              transactions.map((tx) => (
                <View
                  key={tx._id}
                  style={[styles.transactionItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                >
                  <View style={[styles.txIconContainer, { backgroundColor: themeColors.slate[50] }]}>
                    {getTransactionIcon(tx.type)}
                  </View>
                  <View style={styles.txContent}>
                    <Text style={[styles.txDescription, { color: themeColors.text.primary }]}>
                      {tx.description}
                    </Text>
                    <Text style={[styles.txDate, { color: themeColors.text.muted }]}>
                      {formatDate(tx.createdAt)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.amount >= 0 ? colors.success[500] : colors.danger[500] },
                    ]}
                  >
                    {tx.amount >= 0 ? '+' : ''}
                    {formatPrice(tx.amount)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Withdrawals List */}
        {activeTab === 'withdrawals' && (
          <View style={styles.listContainer}>
            {withdrawals.length === 0 ? (
              <View style={styles.emptyContainer}>
                <CreditCard size={48} color={themeColors.text.muted} />
                <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
                  No hay retiros
                </Text>
              </View>
            ) : (
              withdrawals.map((withdrawal) => (
                <View
                  key={withdrawal._id}
                  style={[styles.withdrawalItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                >
                  <View style={styles.withdrawalHeader}>
                    <Text style={[styles.withdrawalAmount, { color: themeColors.text.primary }]}>
                      {formatPrice(withdrawal.amount)}
                    </Text>
                    <View style={styles.withdrawalStatus}>
                      {getWithdrawalStatusIcon(withdrawal.status)}
                      <Text style={[styles.withdrawalStatusText, { color: themeColors.text.secondary }]}>
                        {getWithdrawalStatusText(withdrawal.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.withdrawalDate, { color: themeColors.text.muted }]}>
                    {formatDate(withdrawal.createdAt)}
                  </Text>
                  {withdrawal.rejectionReason && (
                    <Text style={[styles.rejectionReason, { color: colors.danger[500] }]}>
                      Razón: {withdrawal.rejectionReason}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  balanceCard: {
    padding: spacing.xl,
    borderRadius: borderRadius['2xl'],
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  pendingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
  },
  withdrawButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  withdrawButtonText: {
    color: colors.primary[600],
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  withdrawForm: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  formTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  submitButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  listContainer: {
    gap: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    fontSize: fontSize.base,
    marginTop: spacing.md,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  txIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  txContent: {
    flex: 1,
  },
  txDescription: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  txDate: {
    fontSize: fontSize.xs,
  },
  txAmount: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  withdrawalItem: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  withdrawalAmount: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  withdrawalStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  withdrawalStatusText: {
    fontSize: fontSize.sm,
  },
  withdrawalDate: {
    fontSize: fontSize.xs,
  },
  rejectionReason: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});
