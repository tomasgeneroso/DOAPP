import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../hooks/useSocket';
import { useState, useEffect, useCallback } from 'react';
import { get } from '../../services/api';
import {
  Banknote,
  Clock,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  User,
  CreditCard,
  AlertCircle,
  Loader,
} from 'lucide-react-native';

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  cbu: string;
  createdAt: string;
  user?: {
    name: string;
    email: string;
  };
  approvedBy?: {
    name: string;
  };
  processedBy?: {
    name: string;
  };
  adminNotes?: string;
}

export default function AdminWithdrawals() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isConnected, subscribe } = useSocket();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  const loadWithdrawals = async () => {
    try {
      const response = await get<any>('/admin/withdrawals?limit=50');
      if (response.success && response.data) {
        setWithdrawals(response.data);
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadWithdrawals();
  }, []);

  useEffect(() => {
    loadWithdrawals();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const unsubCreated = subscribe('admin:withdrawal:created', (data) => {
      setRealtimeAlert(`Nueva solicitud de retiro: $${data.withdrawal?.amount?.toLocaleString('es-AR')}`);
      setWithdrawals(prev => [data.withdrawal, ...prev]);
      setTimeout(() => setRealtimeAlert(null), 5000);
    });

    const unsubUpdated = subscribe('admin:withdrawal:updated', (data) => {
      setRealtimeAlert(`Retiro actualizado: $${data.withdrawal?.amount?.toLocaleString('es-AR')}`);
      setWithdrawals(prev =>
        prev.map(w => w.id === data.withdrawal?.id ? { ...w, ...data.withdrawal } : w)
      );
      setTimeout(() => setRealtimeAlert(null), 5000);
    });

    return () => {
      unsubCreated();
      unsubUpdated();
    };
  }, [subscribe]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#eab308';
      case 'approved': return '#3b82f6';
      case 'processing': return '#8b5cf6';
      case 'completed': return '#22c55e';
      case 'rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Aprobado',
      processing: 'Procesando',
      completed: 'Completado',
      rejected: 'Rechazado',
    };
    return labels[status] || status;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return Clock;
      case 'approved': return CheckCircle;
      case 'processing': return Loader;
      case 'completed': return CheckCircle;
      case 'rejected': return XCircle;
      default: return AlertCircle;
    }
  };

  const formatCBU = (cbu: string) => {
    if (!cbu) return 'Sin CBU';
    return `${cbu.slice(0, 4)}...${cbu.slice(-4)}`;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Connection Status */}
      <View style={[
        styles.connectionBar,
        { backgroundColor: isConnected ? colors.success + '20' : colors.error + '20' }
      ]}>
        {isConnected ? (
          <Wifi size={14} color={colors.success} />
        ) : (
          <WifiOff size={14} color={colors.error} />
        )}
        <Text style={[
          styles.connectionText,
          { color: isConnected ? colors.success : colors.error }
        ]}>
          {isConnected ? 'Actualizaciones en tiempo real activas' : 'Sin conexión en tiempo real'}
        </Text>
      </View>

      {/* Real-time Alert */}
      {realtimeAlert && (
        <View style={[styles.alertBanner, { backgroundColor: colors.warning + '20' }]}>
          <Clock size={16} color={colors.warning} />
          <Text style={[styles.alertText, { color: colors.warning }]}>{realtimeAlert}</Text>
        </View>
      )}

      {/* Withdrawals List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>Cargando retiros...</Text>
        </View>
      ) : withdrawals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Banknote size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No hay solicitudes de retiro
          </Text>
        </View>
      ) : (
        withdrawals.map((withdrawal) => {
          const StatusIcon = getStatusIcon(withdrawal.status);
          return (
            <TouchableOpacity
              key={withdrawal.id}
              style={[styles.withdrawalCard, { backgroundColor: colors.card }]}
              onPress={() => {/* Navigate to withdrawal detail */}}
            >
              <View style={styles.withdrawalHeader}>
                <View style={styles.amountContainer}>
                  <Banknote size={20} color={colors.success} />
                  <Text style={[styles.amount, { color: colors.text }]}>
                    ${withdrawal.amount?.toLocaleString('es-AR')}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(withdrawal.status) + '20' }]}>
                  <StatusIcon size={12} color={getStatusColor(withdrawal.status)} />
                  <Text style={[styles.statusText, { color: getStatusColor(withdrawal.status) }]}>
                    {getStatusLabel(withdrawal.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.withdrawalDetails}>
                <View style={styles.detailRow}>
                  <User size={14} color={colors.textSecondary} />
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                    {withdrawal.user?.name || 'Usuario'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <CreditCard size={14} color={colors.textSecondary} />
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                    CBU: {formatCBU(withdrawal.cbu)}
                  </Text>
                </View>
              </View>

              <View style={styles.withdrawalFooter}>
                <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                  {new Date(withdrawal.createdAt).toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              {withdrawal.approvedBy && (
                <View style={[styles.adminBadge, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.adminText, { color: colors.primary }]}>
                    Aprobado por: {withdrawal.approvedBy.name}
                  </Text>
                </View>
              )}

              {withdrawal.adminNotes && (
                <View style={[styles.notesContainer, { backgroundColor: colors.border }]}>
                  <Text style={[styles.notesText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {withdrawal.adminNotes}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  connectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
  },
  withdrawalCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amount: {
    fontSize: 20,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  withdrawalDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
  },
  withdrawalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dateText: {
    fontSize: 12,
  },
  adminBadge: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  adminText: {
    fontSize: 11,
    fontWeight: '500',
  },
  notesContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  notesText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
