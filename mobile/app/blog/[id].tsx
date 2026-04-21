import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, Eye, Calendar, ChevronLeft, ChevronRight, User } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { get, post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function BlogDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [post2, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [liking, setLiking] = useState(false);

  useEffect(() => { if (id) fetchPost(); }, [id]);

  const fetchPost = async () => {
    try {
      const res = await get<any>(`/posts/${id}`);
      if (res.success) {
        setPost((res as any).post);
        const p = (res as any).post;
        setLikesCount(p.likesCount || p.likes?.length || 0);
        if (user) setIsLiked(p.likes?.includes(user.id) || false);
      }
    } catch (err) {
      console.error('Error loading post:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!user || liking) return;
    setLiking(true);
    try {
      const res = await post<any>(`/posts/${id}/like`, {});
      if (res.success) {
        setIsLiked(!isLiked);
        setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
      }
    } catch (err) {
      console.error('Error liking post:', err);
    } finally {
      setLiking(false);
    }
  };

  const gallery = post2?.gallery || [];
  const hasImages = gallery.length > 0;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary[500]} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!post2) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={24} color={themeColors.text.primary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Post</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}><Text style={{ color: themeColors.text.secondary }}>No se encontró el post</Text></View>
      </SafeAreaView>
    );
  }

  const author = post2.author || {};

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={24} color={themeColors.text.primary} /></TouchableOpacity>
        <Text style={[styles.topTitle, { color: themeColors.text.primary }]} numberOfLines={1}>{post2.title}</Text>
        <TouchableOpacity onPress={handleLike} style={styles.likeHeaderBtn}>
          <Heart size={22} color={isLiked ? '#ef4444' : themeColors.text.muted} fill={isLiked ? '#ef4444' : 'none'} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        {hasImages && (
          <View style={styles.galleryContainer}>
            <Image
              source={{ uri: gallery[imageIndex]?.url || gallery[imageIndex] }}
              style={styles.galleryImage}
              resizeMode="cover"
            />
            {gallery.length > 1 && (
              <>
                <TouchableOpacity
                  style={[styles.galleryBtn, styles.galleryBtnLeft]}
                  onPress={() => setImageIndex(i => Math.max(0, i - 1))}
                  disabled={imageIndex === 0}
                >
                  <ChevronLeft size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.galleryBtn, styles.galleryBtnRight]}
                  onPress={() => setImageIndex(i => Math.min(gallery.length - 1, i + 1))}
                  disabled={imageIndex === gallery.length - 1}
                >
                  <ChevronRight size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.galleryDots}>
                  {gallery.map((_: any, i: number) => (
                    <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        <View style={styles.content}>
          {/* Title & Meta */}
          <Text style={[styles.title, { color: themeColors.text.primary }]}>{post2.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Calendar size={14} color={themeColors.text.muted} />
              <Text style={[styles.metaText, { color: themeColors.text.muted }]}>
                {new Date(post2.createdAt).toLocaleDateString('es-AR')}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Eye size={14} color={themeColors.text.muted} />
              <Text style={[styles.metaText, { color: themeColors.text.muted }]}>{post2.viewsCount || 0} vistas</Text>
            </View>
          </View>

          {/* Tags */}
          {post2.tags && post2.tags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {post2.tags.map((tag: string) => (
                  <View key={tag} style={[styles.tag, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                    <Text style={[styles.tagText, { color: themeColors.text.secondary }]}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Description */}
          <Text style={[styles.description, { color: themeColors.text.secondary }]}>{post2.description}</Text>

          {/* Price */}
          {post2.price && (
            <View style={[styles.priceCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.priceLabel, { color: themeColors.text.secondary }]}>Precio del servicio</Text>
              <Text style={[styles.priceValue, { color: colors.primary[600] }]}>
                ${Number(post2.price).toLocaleString('es-AR')} {post2.currency || 'ARS'}
              </Text>
            </View>
          )}

          {/* Author */}
          <TouchableOpacity
            style={[styles.authorCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => router.push(`/user/${author.id || author._id}`)}
            activeOpacity={0.8}
          >
            {author.avatar ? (
              <Image source={{ uri: author.avatar }} style={styles.authorAvatar} />
            ) : (
              <View style={styles.authorAvatarPlaceholder}><User size={22} color={colors.primary[600]} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.authorName, { color: themeColors.text.primary }]}>{author.name}</Text>
              {author.bio && <Text style={[styles.authorBio, { color: themeColors.text.muted }]} numberOfLines={2}>{author.bio}</Text>}
              {author.rating && <Text style={[styles.authorRating, { color: themeColors.text.secondary }]}>⭐ {Number(author.rating).toFixed(1)}</Text>}
            </View>
            <Text style={{ color: colors.primary[600], fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          {/* Like Button */}
          <TouchableOpacity
            style={[styles.likeBtn, { borderColor: isLiked ? '#ef4444' : themeColors.border, backgroundColor: isLiked ? '#fef2f2' : themeColors.card }]}
            onPress={handleLike}
            disabled={liking}
          >
            <Heart size={20} color={isLiked ? '#ef4444' : themeColors.text.secondary} fill={isLiked ? '#ef4444' : 'none'} />
            <Text style={[styles.likeBtnText, { color: isLiked ? '#ef4444' : themeColors.text.secondary }]}>
              {likesCount} {likesCount === 1 ? 'me gusta' : 'me gusta'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '600', marginHorizontal: 8 },
  likeHeaderBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  galleryContainer: { position: 'relative', width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.6 },
  galleryImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.6 },
  galleryBtn: { position: 'absolute', top: '40%', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  galleryBtnLeft: { left: 12 },
  galleryBtnRight: { right: 12 },
  galleryDots: { position: 'absolute', bottom: 12, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12, lineHeight: 30 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  tagText: { fontSize: 12 },
  description: { fontSize: 15, lineHeight: 24, marginBottom: 16 },
  priceCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 16 },
  priceLabel: { fontSize: 12, marginBottom: 4 },
  priceValue: { fontSize: 20, fontWeight: '700' },
  authorCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 16 },
  authorAvatar: { width: 48, height: 48, borderRadius: 24 },
  authorAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center' },
  authorName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  authorBio: { fontSize: 13, lineHeight: 18 },
  authorRating: { fontSize: 12, marginTop: 2 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 14 },
  likeBtnText: { fontSize: 15, fontWeight: '600' },
});
