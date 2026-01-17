import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../hooks/useSocket';
import { useState, useEffect, useCallback } from 'react';
import { get } from '../../services/api';
import {
  LayoutDashboard,
  Users,
  FileText,
  AlertTriangle,
  Ticket,
  DollarSign,
  Wifi,
  WifiOff,
  ChevronRight,
  TrendingUp,
  Clock,
} from 'lucide-react-native';

interface AdminStats {
  totalUsers: number;
  totalJobs: number;
  totalContracts: number;
  pendingDisputes: number;
  openTickets: number;
  pendingWithdrawals: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { isConnected, subscribe } = useSocket();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const response = await get<any>('/admin/analytics/overview');
      if (response.success && response.data) {
        setStats({
          totalUsers: response.data.users?.total || 0,
          totalJobs: response.data.jobs?.total || 0,
          totalContracts: response.data.contracts?.total || 0,
          pendingDisputes: response.data.disputes?.open || 0,
          openTickets: response.data.tickets?.open || 0,
          pendingWithdrawals: response.data.withdrawals?.pending || 0,
        });
      }
    } catch (error) {
      console.error('Error loading admin stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStats();
  }, []);

  useEffect(() => {
    loadStats();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const showAlert = (message: string) => {
      setRealtimeAlert(message);
      setTimeout(() => setRealtimeAlert(null), 5000);
      loadStats(); // Refresh stats
    };

    const unsubDispute = subscribe('admin:dispute:created', (data) => {
      showAlert(`Nueva disputa: ${data.dispute?.reason || 'Sin motivo'}`);
    });

    const unsubTicket = subscribe('admin:ticket:created', (data) => {
      showAlert(`Nuevo ticket: ${data.ticket?.subject || 'Sin asunto'}`);
    });

    const unsubWithdrawal = subscribe('admin:withdrawal:created', (data) => {
      const amount = data.withdrawal?.amount?.toLocaleString('es-AR') || '0';
      showAlert(`Nueva solicitud de retiro: $${amount}`);
    });

    const unsubUser = subscribe('admin:user:created', (data) => {
      showAlert(`Nuevo usuario: ${data.user?.name || data.user?.email}`);
    });

    return () => {
      unsubDispute();
      unsubTicket();
      unsubWithdrawal();
      unsubUser();
    };
  }, [subscribe]);

  const menuItems = [
    {
      title: 'Disputas',
      icon: AlertTriangle,
      color: '#f59e0b',
      route: '/admin/disputes',
      count: stats?.pendingDisputes,
      roles: ['owner', 'super_admin', 'admin', 'support'],
    },
    {
      title: 'Tickets',
      icon: Ticket,
      color: '#8b5cf6',
      route: '/admin/tickets',
      count: stats?.openTickets,
      roles: ['owner', 'super_admin', 'admin', 'support'],
    },
    {
      title: 'Retiros',
      icon: DollarSign,
      color: '#10b981',
      route: '/admin/withdrawals',
      count: stats?.pendingWithdrawals,
      roles: ['owner', 'super_admin', 'admin'],
    },
  ];

  const filteredMenuItems = menuItems.filter(item =>
    item.roles.includes(user?.adminRole || '')
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Real-time Alert */}
      {realtimeAlert && (
        <View style={[styles.alertBanner, { backgroundColor: colors.warning + '20' }]}>
          <Clock size={16} color={colors.warning} />
          <Text style={[styles.alertText, { color: colors.warning }]}>{realtimeAlert}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Panel Admin</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {user?.adminRole?.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        <View style={[
          styles.connectionBadge,
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
            {isConnected ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.card }]}>
          <Users size={24} color={colors.primary} />
          <Text style={[styles.statNumber, { color: colors.text }]}>
            {stats?.totalUsers || 0}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Usuarios</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card }]}>
          <FileText size={24} color={colors.primary} />
          <Text style={[styles.statNumber, { color: colors.text }]}>
            {stats?.totalJobs || 0}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Trabajos</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card }]}>
          <TrendingUp size={24} color={colors.primary} />
          <Text style={[styles.statNumber, { color: colors.text }]}>
            {stats?.totalContracts || 0}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Contratos</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Gestión</Text>
        {filteredMenuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push(item.route as any)}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.color + '20' }]}>
              <item.icon size={20} color={item.color} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{item.title}</Text>
            </View>
            {item.count !== undefined && item.count > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>{item.count}</Text>
              </View>
            )}
            <ChevronRight size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Back to App */}
      <TouchableOpacity
        style={[styles.backButton, { borderColor: colors.border }]}
        onPress={() => router.push('/(tabs)')}
      >
        <Text style={[styles.backButtonText, { color: colors.textSecondary }]}>
          Volver a la app
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  menuSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 32,
  },
  backButtonText: {
    fontSize: 16,
  },
});
