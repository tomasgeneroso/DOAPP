import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../hooks/useSocket';
import { useState, useEffect, useCallback } from 'react';
import { get } from '../../services/api';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  MessageSquare,
  Wifi,
  WifiOff,
  ChevronRight,
} from 'lucide-react-native';

interface Dispute {
  id: string;
  reason: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  initiatedBy?: {
    name: string;
  };
  against?: {
    name: string;
  };
}

export default function AdminDisputes() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isConnected, subscribe } = useSocket();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  const loadDisputes = async () => {
    try {
      const response = await get<any>('/admin/disputes?limit=50');
      if (response.success && response.data) {
        setDisputes(response.data);
      }
    } catch (error) {
      console.error('Error loading disputes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDisputes();
  }, []);

  useEffect(() => {
    loadDisputes();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const unsubCreated = subscribe('admin:dispute:created', (data) => {
      setRealtimeAlert(`Nueva disputa: ${data.dispute?.reason || 'Sin motivo'}`);
      setDisputes(prev => [data.dispute, ...prev]);
      setTimeout(() => setRealtimeAlert(null), 5000);
    });

    const unsubUpdated = subscribe('admin:dispute:updated', (data) => {
      setRealtimeAlert(`Disputa actualizada: ${data.dispute?.reason || 'Sin motivo'}`);
      setDisputes(prev =>
        prev.map(d => d.id === data.dispute?.id ? { ...d, ...data.dispute } : d)
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
      case 'open': return '#eab308';
      case 'in_review': return '#3b82f6';
      case 'resolved_released':
      case 'resolved_refunded':
      case 'resolved_partial': return '#22c55e';
      default: return '#6b7280';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Abierta',
      in_review: 'En Revisión',
      awaiting_info: 'Esperando Info',
      resolved_released: 'Resuelta',
      resolved_refunded: 'Reembolsada',
      resolved_partial: 'Resuelta Parcial',
    };
    return labels[status] || status;
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      urgent: 'Urgente',
      high: 'Alta',
      medium: 'Media',
      low: 'Baja',
    };
    return labels[priority] || priority;
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

      {/* Disputes List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>Cargando disputas...</Text>
        </View>
      ) : disputes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <AlertTriangle size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No hay disputas pendientes
          </Text>
        </View>
      ) : (
        disputes.map((dispute) => (
          <TouchableOpacity
            key={dispute.id}
            style={[styles.disputeCard, { backgroundColor: colors.card }]}
            onPress={() => {/* Navigate to dispute detail */}}
          >
            <View style={styles.disputeHeader}>
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(dispute.priority) + '20' }]}>
                <Text style={[styles.priorityText, { color: getPriorityColor(dispute.priority) }]}>
                  {getPriorityLabel(dispute.priority)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(dispute.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(dispute.status) }]}>
                  {getStatusLabel(dispute.status)}
                </Text>
              </View>
            </View>

            <Text style={[styles.disputeReason, { color: colors.text }]} numberOfLines={2}>
              {dispute.reason}
            </Text>

            <View style={styles.disputeFooter}>
              <Text style={[styles.disputeParties, { color: colors.textSecondary }]}>
                {dispute.initiatedBy?.name} vs {dispute.against?.name}
              </Text>
              <Text style={[styles.disputeDate, { color: colors.textSecondary }]}>
                {new Date(dispute.createdAt).toLocaleDateString('es-AR')}
              </Text>
            </View>
          </TouchableOpacity>
        ))
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
  disputeCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  disputeHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  disputeReason: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
  },
  disputeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disputeParties: {
    fontSize: 12,
  },
  disputeDate: {
    fontSize: 12,
  },
});
