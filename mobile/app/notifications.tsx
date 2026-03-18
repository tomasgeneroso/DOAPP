import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  Briefcase,
  FileText,
  CreditCard,
  MessageSquare,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { get, put, del } from '../services/api';
import { Notification } from '../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchNotifications = async (pageNum = 1, append = false) => {
    try {
      const res = await get<any>(`/notifications?page=${pageNum}&limit=20`);
      if (res.success) {
        const items = (res as any).data || [];
        if (append) {
          setNotifications(prev => [...prev, ...items]);
        } else {
          setNotifications(items);
        }
        setUnreadCount((res as any).unreadCount || 0);
        const pagination = (res as any).pagination;
        if (pagination) {
          setHasMore(pageNum < pagination.pages);
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchNotifications(1);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  };

  const markAsRead = async (id: string) => {
    try {
      await put<any>(`/notifications/${id}/read`, {});
      setNotifications(prev =>
        prev.map(n => (n._id === id || (n as any).id === id) ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await put<any>('/notifications/read-all', {});
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await del<any>(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => (n._id !== id && (n as any).id !== id)));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getCategoryIcon = (category: string, type: string) => {
    const iconColor = type === 'success' ? colors.success[500]
      : type === 'warning' ? colors.warning[500]
      : type === 'error' ? colors.danger[500]
      : colors.primary[500];

    switch (category) {
      case 'job': return <Briefcase size={20} color={iconColor} />;
      case 'contract': return <FileText size={20} color={iconColor} />;
      case 'payment': return <CreditCard size={20} color={iconColor} />;
      case 'chat': return <MessageSquare size={20} color={iconColor} />;
      default: return <Bell size={20} color={iconColor} />;
    }
  };

  const getTypeBg = (type: string) => {
    switch (type) {
      case 'success': return colors.success[50];
      case 'warning': return colors.warning[50];
      case 'error': return colors.danger[50];
      default: return colors.primary[50];
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHr < 24) return `${diffHr}h`;
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const handleNotificationPress = (notif: Notification) => {
    const id = (notif as any).id || notif._id;
    if (!notif.read) {
      markAsRead(id);
    }
    // Navigate based on category/data
    const data = notif.data;
    if (data?.jobId) {
      router.push(`/job/${data.jobId}`);
    } else if (data?.contractId) {
      router.push(`/contracts/${data.contractId}`);
    } else if (data?.conversationId) {
      router.push(`/chat/${data.conversationId}`);
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const id = (item as any).id || item._id;
    return (
      <TouchableOpacity
        style={[
          styles.notifItem,
          { backgroundColor: item.read ? themeColors.card : (themeColors.primary[50] || '#f0f9ff'), borderColor: themeColors.border },
        ]}
        onPress={() => handleNotificationPress(item)}
        onLongPress={() => {
          Alert.alert('Opciones', '', [
            { text: 'Marcar como leida', onPress: () => markAsRead(id) },
            { text: 'Eliminar', style: 'destructive', onPress: () => deleteNotification(id) },
            { text: 'Cancelar', style: 'cancel' },
          ]);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: getTypeBg(item.type) }]}>
          {getCategoryIcon(item.category, item.type)}
        </View>
        <View style={styles.notifContent}>
          <Text style={[styles.notifTitle, { color: themeColors.text.primary }, !item.read && styles.notifTitleUnread]}>
            {item.title}
          </Text>
          <Text style={[styles.notifMessage, { color: themeColors.text.secondary }]} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={[styles.notifTime, { color: themeColors.text.muted }]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
        {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary[500] }]} />}
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
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Notificaciones</Text>
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Notificaciones {unreadCount > 0 ? `(${unreadCount})` : ''}
        </Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllAsRead} style={styles.backButton}>
            <CheckCheck size={22} color={colors.primary[600]} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <BellOff size={48} color={themeColors.text.muted} />
          <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>Sin notificaciones</Text>
          <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
            No tenes notificaciones por ahora
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => (item as any).id || item._id}
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
  listContent: { padding: spacing.md, gap: spacing.sm },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 2 },
  notifTitleUnread: { fontWeight: fontWeight.bold },
  notifMessage: { fontSize: fontSize.sm, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: fontSize.xs },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
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
