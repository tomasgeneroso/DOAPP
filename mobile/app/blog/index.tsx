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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, FileText, Eye, Trash2, Edit3 } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { get, del } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface BlogPost {
  id: string;
  _id: string;
  title: string;
  subtitle: string;
  excerpt: string;
  category: string;
  status: 'draft' | 'published' | 'archived';
  views: number;
  createdAt: string;
  publishedAt?: string;
}

export default function MyBlogScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors: themeColors } = useTheme();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchPosts();
  }, [isAuthenticated, authLoading]);

  const fetchPosts = async () => {
    try {
      const response = await get<any>('/blogs/my-posts');
      if (response.success) {
        setPosts(response.posts || []);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPosts();
  }, []);

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Eliminar artículo',
      `¿Eliminás "${title}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const response = await del(`/blogs/${id}`);
            if (response.success) {
              setPosts(prev => prev.filter(p => (p.id || p._id) !== id));
            } else {
              Alert.alert('Error', 'No se pudo eliminar el artículo');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return colors.success[500];
      case 'draft': return colors.warning[500];
      default: return colors.slate[400];
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'published': return 'Publicado';
      case 'draft': return 'Borrador';
      case 'archived': return 'Archivado';
      default: return status;
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderPost = ({ item }: { item: BlogPost }) => {
    const postId = item.id || item._id;
    return (
      <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => handleDelete(postId, item.title)} style={styles.actionBtn}>
              <Trash2 size={16} color={colors.danger[500]} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.cardTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.cardExcerpt, { color: themeColors.text.secondary }]} numberOfLines={2}>
          {item.excerpt || item.subtitle}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.viewsRow}>
            <Eye size={13} color={themeColors.text.muted} />
            <Text style={[styles.viewsText, { color: themeColors.text.muted }]}>{item.views || 0} vistas</Text>
          </View>
          <Text style={[styles.dateText, { color: themeColors.text.muted }]}>
            {formatDate(item.publishedAt || item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Mis artículos</Text>
          <View style={{ width: 40 }} />
        </View>
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Mis artículos</Text>
        <TouchableOpacity onPress={() => router.push('/blog/create')} style={styles.addButton}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id || item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✍️</Text>
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              No publicaste artículos aún
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>
              Compartí tu conocimiento con la comunidad
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: colors.primary[600] }]}
              onPress={() => router.push('/blog/create')}
            >
              <Text style={styles.emptyButtonText}>Escribir artículo</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: { padding: spacing.xs, width: 40 },
  addButton: { padding: spacing.xs },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  list: { padding: spacing.md, paddingBottom: 40 },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { padding: spacing.xs },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  cardExcerpt: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText: { fontSize: fontSize.xs },
  dateText: { fontSize: fontSize.xs },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, paddingTop: 80 },
  emptyIcon: { fontSize: 64, marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm, textAlign: 'center' },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.lg },
  emptyButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  emptyButtonText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
