import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, Calendar, User, Clock, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { get, del, post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { getCategoryById } from '../../services/jobs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PortfolioItem {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  likes: number;
  likedBy?: string[];
  featured: boolean;
  clientName?: string;
  projectDuration?: string;
  createdAt: string;
}

export default function PortfolioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [item, setItem] = useState<PortfolioItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    fetchItem();
  }, [id]);

  const fetchItem = async () => {
    try {
      const response = await get<any>(`/portfolio/${id}`);
      if (response.success) {
        setItem((response as any).data || response.data);
      }
    } catch (error) {
      console.error('Error fetching portfolio item:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!item || liking) return;
    setLiking(true);
    try {
      const response = await post<any>(`/portfolio/${id}/like`, {});
      if (response.success) {
        const raw = response as any;
        setItem((prev) => prev ? { ...prev, likes: raw.likes ?? prev.likes } : prev);
      }
    } catch (error) {
      console.error('Like error:', error);
    } finally {
      setLiking(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar trabajo',
      '¿Estás seguro que querés eliminar este trabajo del portfolio?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const response = await del(`/portfolio/${id}`);
            if (response.success) {
              router.replace('/portfolio');
            } else {
              Alert.alert('Error', 'No se pudo eliminar el trabajo');
            }
          },
        },
      ]
    );
  };

  const isOwner = item && (user?.id === item.userId || user?._id === item.userId);
  const cat = item ? getCategoryById(item.category) : null;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={[{ color: themeColors.text.secondary, fontSize: fontSize.base }]}>
            Trabajo no encontrado
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/portfolio')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {item.title}
        </Text>
        {isOwner ? (
          <TouchableOpacity onPress={handleDelete} style={styles.backButton}>
            <Trash2 size={20} color={colors.danger[500]} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Images */}
        {item.images && item.images.length > 0 ? (
          <View>
            <Image
              source={{ uri: item.images[activeImage] }}
              style={styles.mainImage}
              resizeMode="cover"
            />
            {item.images.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbsRow}
              >
                {item.images.map((uri, i) => (
                  <TouchableOpacity key={i} onPress={() => setActiveImage(i)}>
                    <Image
                      source={{ uri }}
                      style={[
                        styles.thumb,
                        { borderColor: i === activeImage ? colors.primary[600] : 'transparent' },
                      ]}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        <View style={styles.content}>
          {/* Title + Like */}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: themeColors.text.primary }]}>{item.title}</Text>
            <TouchableOpacity style={styles.likeBtn} onPress={handleLike} disabled={liking}>
              <Heart size={20} color={colors.danger[500]} fill={colors.danger[500]} />
              <Text style={[styles.likesCount, { color: themeColors.text.secondary }]}>{item.likes || 0}</Text>
            </TouchableOpacity>
          </View>

          {/* Category */}
          {cat && (
            <View style={[styles.badge, { backgroundColor: themeColors.primary[50] }]}>
              <Text style={[styles.badgeText, { color: themeColors.primary[600] }]}>
                {cat.icon} {cat.label}
              </Text>
            </View>
          )}

          {/* Meta */}
          <View style={[styles.metaCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {item.clientName && (
              <View style={styles.metaRow}>
                <User size={16} color={themeColors.text.muted} />
                <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
                  Cliente: <Text style={{ color: themeColors.text.primary }}>{item.clientName}</Text>
                </Text>
              </View>
            )}
            {item.projectDuration && (
              <View style={styles.metaRow}>
                <Clock size={16} color={themeColors.text.muted} />
                <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
                  Duración: <Text style={{ color: themeColors.text.primary }}>{item.projectDuration}</Text>
                </Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Calendar size={16} color={themeColors.text.muted} />
              <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
                {new Date(item.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </View>

          {/* Description */}
          <Text style={[styles.sectionLabel, { color: themeColors.text.primary }]}>Descripción</Text>
          <Text style={[styles.description, { color: themeColors.text.secondary }]}>{item.description}</Text>
        </View>
      </ScrollView>
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
  topBarTitle: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, textAlign: 'center', marginHorizontal: spacing.sm },
  mainImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.65 },
  thumbsRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8 },
  thumb: { width: 64, height: 64, borderRadius: borderRadius.md, borderWidth: 2, marginRight: 8 },
  content: { padding: spacing.lg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginRight: spacing.md },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likesCount: { fontSize: fontSize.sm },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, marginBottom: spacing.md },
  badgeText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  metaCard: { borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg, gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: fontSize.sm },
  sectionLabel: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: spacing.sm },
  description: { fontSize: fontSize.base, lineHeight: 24 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
