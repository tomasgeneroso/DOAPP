import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../hooks/useSocket';
import { useState, useEffect, useCallback } from 'react';
import { get } from '../../services/api';
import {
  Ticket,
  Clock,
  CheckCircle,
  MessageSquare,
  Wifi,
  WifiOff,
  ChevronRight,
  User,
  AlertCircle,
} from 'lucide-react-native';

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  user?: {
    name: string;
  };
  assignedTo?: {
    name: string;
  };
  messagesCount?: number;
}

export default function AdminTickets() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isConnected, subscribe } = useSocket();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  const loadTickets = async () => {
    try {
      const response = await get<any>('/admin/tickets?limit=50');
      if (response.success && response.data) {
        setTickets(response.data);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTickets();
  }, []);

  useEffect(() => {
    loadTickets();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const unsubCreated = subscribe('admin:ticket:created', (data) => {
      setRealtimeAlert(`Nuevo ticket: ${data.ticket?.subject || 'Sin asunto'}`);
      setTickets(prev => [data.ticket, ...prev]);
      setTimeout(() => setRealtimeAlert(null), 5000);
    });

    const unsubUpdated = subscribe('admin:ticket:updated', (data) => {
      setRealtimeAlert(`Ticket actualizado: ${data.ticket?.subject || 'Sin asunto'}`);
      setTickets(prev =>
        prev.map(t => t.id === data.ticket?.id ? { ...t, ...data.ticket } : t)
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
      case 'in_progress': return '#3b82f6';
      case 'waiting_response': return '#f97316';
      case 'resolved':
      case 'closed': return '#22c55e';
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
      open: 'Abierto',
      in_progress: 'En Progreso',
      waiting_response: 'Esperando Respuesta',
      resolved: 'Resuelto',
      closed: 'Cerrado',
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

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      technical: 'Técnico',
      billing: 'Facturación',
      account: 'Cuenta',
      general: 'General',
      bug: 'Bug',
      feature: 'Sugerencia',
    };
    return labels[category] || category;
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

      {/* Tickets List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>Cargando tickets...</Text>
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ticket size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No hay tickets pendientes
          </Text>
        </View>
      ) : (
        tickets.map((ticket) => (
          <TouchableOpacity
            key={ticket.id}
            style={[styles.ticketCard, { backgroundColor: colors.card }]}
            onPress={() => {/* Navigate to ticket detail */}}
          >
            <View style={styles.ticketHeader}>
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(ticket.priority) + '20' }]}>
                <Text style={[styles.priorityText, { color: getPriorityColor(ticket.priority) }]}>
                  {getPriorityLabel(ticket.priority)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>
                  {getStatusLabel(ticket.status)}
                </Text>
              </View>
            </View>

            <Text style={[styles.ticketSubject, { color: colors.text }]} numberOfLines={2}>
              {ticket.subject}
            </Text>

            <View style={styles.ticketMeta}>
              <View style={[styles.categoryBadge, { backgroundColor: colors.border }]}>
                <Text style={[styles.categoryText, { color: colors.textSecondary }]}>
                  {getCategoryLabel(ticket.category)}
                </Text>
              </View>
            </View>

            <View style={styles.ticketFooter}>
              <View style={styles.userInfo}>
                <User size={12} color={colors.textSecondary} />
                <Text style={[styles.userName, { color: colors.textSecondary }]}>
                  {ticket.user?.name || 'Usuario'}
                </Text>
              </View>
              {ticket.messagesCount && ticket.messagesCount > 0 && (
                <View style={styles.messagesCount}>
                  <MessageSquare size={12} color={colors.textSecondary} />
                  <Text style={[styles.messagesText, { color: colors.textSecondary }]}>
                    {ticket.messagesCount}
                  </Text>
                </View>
              )}
              <Text style={[styles.ticketDate, { color: colors.textSecondary }]}>
                {new Date(ticket.createdAt).toLocaleDateString('es-AR')}
              </Text>
            </View>

            {ticket.assignedTo && (
              <View style={[styles.assignedBadge, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.assignedText, { color: colors.primary }]}>
                  Asignado a: {ticket.assignedTo.name}
                </Text>
              </View>
            )}
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
  ticketCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  ticketHeader: {
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
  ticketSubject: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  ticketMeta: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userName: {
    fontSize: 12,
  },
  messagesCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messagesText: {
    fontSize: 12,
  },
  ticketDate: {
    fontSize: 12,
  },
  assignedBadge: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  assignedText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
