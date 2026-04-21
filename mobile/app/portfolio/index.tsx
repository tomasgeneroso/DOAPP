import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Heart, Image as ImageIcon } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { get, del } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  likes: number;
  featured: boolean;
  createdAt: string;
}

export default function PortfolioScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors: themeColors } = useTheme();

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchPortfolio();
  }, [isAuthenticated, authLoading]);

  const fetchPortfolio = async () => {
    try {
      const userId = user?.id || user?._id;
      if (!userId) return;
      const response = await get<any>(`/portfolio/user/${userId}`);
      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : (response as any).data || [];
        setItems(data);
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPortfolio();
  }, []);

  const handleDelete = async (id: string) => {
    const response = await del(`/portfolio/${id}`);
    if (response.success) {
      setItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const renderItem = ({ item }: { item: PortfolioItem }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      onPress={() => router.push(`/portfolio/${item.id}`)}
      activeOpacity={0.85}
    >
      {item.images && item.images.length > 0 ? (
        <Image source={{ uri: item.images[0] }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: themeColors.slate[100] }]}>
          <ImageIcon size={32} color={themeColors.text.muted} />
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.cardCategory, { color: themeColors.primary[600] }]}>
          {item.category}
        </Text>
        <Text style={[styles.cardDescription, { color: themeColors.text.secondary }]} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.cardFooter}>
          <View style={styles.likesRow}>
            <Heart size={14} color={colors.danger[500]} />
            <Text style={[styles.likesText, { color: themeColors.text.muted }]}>{item.likes || 0}</Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(item.id)}>
            <Text style={{ color: colors.danger[500], fontSize: fontSize.xs }}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (authLoading || loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Mi Portfolio</Text>
        <TouchableOpacity onPress={() => router.push('/portfolio/add')} style={styles.addButton}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🖼️</Text>
          <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
            Tu portfolio está vacío
          </Text>
          <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>
            Agregá tus trabajos anteriores para que los clientes vean lo que hacés
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.primary[600] }]}
            onPress={() => router.push('/portfolio/add')}
          >
            <Text style={styles.emptyButtonText}>Agregar trabajo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />
          }
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: { padding: spacing.xs },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  addButton: { padding: spacing.xs },
  list: { padding: spacing.md },
  row: { gap: spacing.md },
  card: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cardImage: { width: '100%', height: 120 },
  cardImagePlaceholder: {
    width: '100%',
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: { padding: spacing.sm },
  cardTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: 2 },
  cardCategory: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: 4 },
  cardDescription: { fontSize: fontSize.xs, marginBottom: spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  likesRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likesText: { fontSize: fontSize.xs },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
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
