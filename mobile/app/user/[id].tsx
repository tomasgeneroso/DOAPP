import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ArrowLeft, Star, MapPin, Calendar, Briefcase, CheckCircle, Award, MessageCircle, Clock, Image as ImageIcon, Heart } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { get, getImageUrl } from '../../services/api';
import { getCategoryById } from '../../services/jobs';

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface UserProfile {
  id: string;
  _id?: string;
  name: string;
  username?: string;
  email?: string;
  avatar?: string;
  coverImage?: string;
  bio?: string;
  location?: string;
  rating: number;
  workQualityRating?: number;
  workerRating?: number;
  contractRating?: number;
  reviewsCount: number;
  jobsCompleted?: number;
  contractsCompleted?: number;
  membershipType?: 'free' | 'pro' | 'super_pro';
  skills?: string[];
  isVerified?: boolean;
  createdAt?: string;
  availabilitySchedule?: {
    timezone?: string;
    slots: { day: number; start: string; end: string }[];
    exceptions?: { date: string; available: boolean; reason?: string }[];
  };
  isAvailabilityPublic?: boolean;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDarkMode, colors: themeColors } = useTheme();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      fetchUserProfile();
      fetchPortfolio();
      fetchReviews();
    }
  }, [id]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await get<UserProfile>(`/users/${id}/profile`);
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        setError(response.message || 'Error al cargar el perfil');
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async () => {
    try {
      const response = await get<any>(`/portfolio/user/${id}`);
      if (response.success) {
        const data = (response as any).data;
        setPortfolio(Array.isArray(data) ? data.slice(0, 6) : []);
      }
    } catch {}
  };

  const fetchReviews = async () => {
    try {
      const response = await get<any>(`/reviews/user/${id}`);
      if (response.success) {
        const data = (response as any).data || (response as any).reviews || [];
        setReviews(Array.isArray(data) ? data.slice(0, 5) : []);
      }
    } catch {}
  };

  const startChat = async () => {
    try {
      const response = await get<any>(`/chat/conversations`);
      const conversations = (response as any).conversations || (response as any).data || [];
      const existing = conversations.find((c: any) => {
        const parts = c.participants || [];
        return parts.some((p: any) => (p.id || p._id) === id || p === id);
      });
      if (existing) {
        router.push(`/chat/${existing.id || existing._id}`);
      } else {
        const { post } = await import('../../services/api');
        const newConv = await post<any>('/chat/conversations', { participantId: id });
        if (newConv.success) {
          const conv = (newConv as any).conversation || newConv.data;
          router.push(`/chat/${conv.id || conv._id}`);
        }
      }
    } catch (err) {
      console.error('Error starting chat:', err);
    }
  };

  const getMembershipBadge = () => {
    switch (user?.membershipType) {
      case 'pro':
        return { label: 'PRO', color: colors.secondary[500] };
      case 'super_pro':
        return { label: 'SUPER PRO', color: '#8b5cf6' };
      default:
        return null;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
          <Text style={[styles.loadingText, { color: themeColors.text.secondary }]}>Cargando perfil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Perfil</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: themeColors.text.secondary }]}>{error || 'Usuario no encontrado'}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: themeColors.primary[600] }]}
            onPress={fetchUserProfile}
          >
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const membershipBadge = getMembershipBadge();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {user.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Image */}
        <View style={[styles.coverContainer, { backgroundColor: themeColors.primary[100] }]}>
          {user.coverImage ? (
            <Image source={{ uri: user.coverImage }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[100] }]} />
          )}
        </View>

        {/* Profile Info Card */}
        <View style={[styles.profileCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[100] }]}>
                <Text style={[styles.avatarText, { color: themeColors.primary[600] }]}>
                  {user.name.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Name and Badge */}
          <View style={styles.nameContainer}>
            <Text style={[styles.userName, { color: themeColors.text.primary }]}>{user.name}</Text>
            {membershipBadge && (
              <View style={[styles.membershipBadge, { backgroundColor: membershipBadge.color }]}>
                <Award size={12} color="#fff" />
                <Text style={styles.membershipBadgeText}>{membershipBadge.label}</Text>
              </View>
            )}
          </View>

          {user.username && (
            <Text style={[styles.userHandle, { color: themeColors.text.secondary }]}>@{user.username}</Text>
          )}

          {/* Rating */}
          <View style={styles.ratingContainer}>
            <Star size={18} color={colors.warning[500]} fill={colors.warning[500]} />
            <Text style={[styles.ratingText, { color: themeColors.text.primary }]}>
              {Number(user.rating || 5).toFixed(1)}
            </Text>
            <Text style={[styles.reviewsText, { color: themeColors.text.secondary }]}>
              ({user.reviewsCount || 0} opiniones)
            </Text>
          </View>

          {/* Bio */}
          {user.bio && (
            <Text style={[styles.bio, { color: themeColors.text.secondary }]}>{user.bio}</Text>
          )}

          {/* Location and Join Date */}
          <View style={styles.metaContainer}>
            {user.location && (
              <View style={styles.metaItem}>
                <MapPin size={16} color={themeColors.text.muted} />
                <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>{user.location}</Text>
              </View>
            )}
            {user.createdAt && (
              <View style={styles.metaItem}>
                <Calendar size={16} color={themeColors.text.muted} />
                <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
                  Miembro desde {formatDate(user.createdAt)}
                </Text>
              </View>
            )}
          </View>

          {/* Contact Button */}
          <TouchableOpacity
            style={[styles.contactButton, { backgroundColor: themeColors.primary[600] }]}
            onPress={startChat}
          >
            <MessageCircle size={20} color="#fff" />
            <Text style={styles.contactButtonText}>Contactar</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Briefcase size={24} color={themeColors.primary[600]} />
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>{user.jobsCompleted || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.secondary }]}>Trabajos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <CheckCircle size={24} color={colors.success[500]} />
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>{user.contractsCompleted || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.secondary }]}>Contratos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Star size={24} color={colors.warning[500]} />
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>{Number(user.rating || 5).toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.secondary }]}>Calificación</Text>
          </View>
        </View>

        {/* Detailed Ratings */}
        {(user.workQualityRating || user.workerRating || user.contractRating) && (
          <View style={[styles.ratingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.ratingsTitle, { color: themeColors.text.primary }]}>Calificaciones detalladas</Text>

            {user.workQualityRating !== undefined && (
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingLabel, { color: themeColors.text.secondary }]}>Calidad del trabajo</Text>
                <View style={styles.ratingStars}>
                  <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} />
                  <Text style={[styles.ratingValue, { color: themeColors.text.primary }]}>{Number(user.workQualityRating).toFixed(1)}</Text>
                </View>
              </View>
            )}

            {user.workerRating !== undefined && (
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingLabel, { color: themeColors.text.secondary }]}>Como trabajador</Text>
                <View style={styles.ratingStars}>
                  <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} />
                  <Text style={[styles.ratingValue, { color: themeColors.text.primary }]}>{Number(user.workerRating).toFixed(1)}</Text>
                </View>
              </View>
            )}

            {user.contractRating !== undefined && (
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingLabel, { color: themeColors.text.secondary }]}>Cumplimiento de contrato</Text>
                <View style={styles.ratingStars}>
                  <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} />
                  <Text style={[styles.ratingValue, { color: themeColors.text.primary }]}>{Number(user.contractRating).toFixed(1)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Skills */}
        {user.skills && user.skills.length > 0 && (
          <View style={[styles.skillsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.skillsTitle, { color: themeColors.text.primary }]}>Habilidades</Text>
            <View style={styles.skillsContainer}>
              {user.skills.map((skill, index) => (
                <View key={index} style={[styles.skillChip, { backgroundColor: isDarkMode ? themeColors.slate[100] : colors.slate[100] }]}>
                  <Text style={[styles.skillText, { color: themeColors.text.secondary }]}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Portfolio */}
        {portfolio.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Portfolio</Text>
            <View style={styles.portfolioGrid}>
              {portfolio.map((item: any) => {
                const cat = getCategoryById(item.category);
                return (
                  <TouchableOpacity
                    key={item.id || item._id}
                    style={[styles.portfolioCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                    onPress={() => router.push(`/portfolio/${item.id || item._id}`)}
                  >
                    {item.images && item.images.length > 0 ? (
                      <Image source={{ uri: getImageUrl(item.images[0]) || item.images[0] }} style={styles.portfolioImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.portfolioImagePlaceholder, { backgroundColor: themeColors.slate[100] }]}>
                        <ImageIcon size={24} color={themeColors.text.muted} />
                      </View>
                    )}
                    <View style={{ padding: spacing.xs }}>
                      <Text style={[styles.portfolioTitle, { color: themeColors.text.primary }]} numberOfLines={1}>{item.title}</Text>
                      {cat && <Text style={[styles.portfolioCategory, { color: themeColors.primary[600] }]}>{cat.icon} {cat.label}</Text>}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Heart size={12} color={colors.danger[400]} />
                        <Text style={[{ fontSize: fontSize.xs, color: themeColors.text.muted }]}>{item.likes || 0}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {portfolio.length >= 6 && (
              <TouchableOpacity onPress={() => router.push(`/user/${id}/portfolio` as any)} style={styles.seeMoreBtn}>
                <Text style={[styles.seeMoreText, { color: themeColors.primary[600] }]}>Ver todo el portfolio →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Opiniones</Text>
            {reviews.map((review: any, idx: number) => {
              const reviewer = review.reviewer;
              const reviewerName = typeof reviewer === 'object' ? reviewer?.name : 'Usuario';
              const reviewerAvatar = typeof reviewer === 'object' ? reviewer?.avatar : null;
              const avgRating = ((review.workQualityRating || 0) + (review.workerRating || 0) + (review.contractRating || 0)) / 3;
              return (
                <View key={review._id || idx} style={[styles.reviewItem, { borderTopColor: themeColors.border, borderTopWidth: idx > 0 ? 1 : 0 }]}>
                  <View style={styles.reviewHeader}>
                    {reviewerAvatar ? (
                      <Image source={{ uri: getImageUrl(reviewerAvatar) || reviewerAvatar }} style={styles.reviewAvatar} />
                    ) : (
                      <View style={[styles.reviewAvatarPlaceholder, { backgroundColor: themeColors.primary[50] }]}>
                        <Text style={{ color: themeColors.primary[600], fontSize: fontSize.xs, fontWeight: fontWeight.bold }}>
                          {reviewerName.substring(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: themeColors.text.primary }]}>{reviewerName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={12} color={colors.warning[500]} fill={s <= Math.round(avgRating) ? colors.warning[500] : 'transparent'} />
                        ))}
                        <Text style={[{ fontSize: fontSize.xs, color: themeColors.text.muted }]}>{avgRating.toFixed(1)}</Text>
                      </View>
                    </View>
                    <Text style={[{ fontSize: fontSize.xs, color: themeColors.text.muted }]}>
                      {new Date(review.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  {review.comment && (
                    <Text style={[{ fontSize: fontSize.sm, color: themeColors.text.secondary, marginTop: spacing.xs, lineHeight: 20 }]} numberOfLines={3}>
                      "{review.comment}"
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Availability Schedule */}
        {user.isAvailabilityPublic && user.availabilitySchedule && user.availabilitySchedule.slots.length > 0 && (
          <View style={[styles.availabilityCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.availabilityTitleRow}>
              <Clock size={18} color={themeColors.primary[600]} />
              <Text style={[styles.availabilityTitle, { color: themeColors.text.primary }]}>Disponibilidad</Text>
            </View>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const slots = user.availabilitySchedule!.slots.filter((s) => s.day === day);
              if (slots.length === 0) return null;
              return (
                <View key={day} style={styles.availabilityDayRow}>
                  <Text style={[styles.availabilityDayName, { color: themeColors.text.primary }]}>
                    {DAY_NAMES_SHORT[day]}
                  </Text>
                  <View style={styles.availabilitySlots}>
                    {slots.map((slot, i) => (
                      <View key={i} style={[styles.availabilitySlotChip, { backgroundColor: colors.primary[50] }]}>
                        <Text style={styles.availabilitySlotText}>
                          {slot.start} - {slot.end}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.base,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['4xl'],
  },
  coverContainer: {
    height: 120,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
  },
  profileCard: {
    marginHorizontal: spacing.lg,
    marginTop: -40,
    padding: spacing.lg,
    paddingTop: 50,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'absolute',
    top: -40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  membershipBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  userHandle: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  ratingText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  reviewsText: {
    fontSize: fontSize.sm,
  },
  bio: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  metaContainer: {
    marginBottom: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  ratingsCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  ratingsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  ratingLabel: {
    fontSize: fontSize.sm,
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  skillsCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  skillsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  skillChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  skillText: {
    fontSize: fontSize.sm,
  },
  availabilityCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  availabilityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  availabilityTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  availabilityDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  availabilityDayName: {
    width: 40,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  availabilitySlots: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  availabilitySlotChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  availabilitySlotText: {
    fontSize: fontSize.xs,
    color: colors.primary[700],
    fontWeight: fontWeight.medium,
  },
  sectionCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  portfolioCard: {
    width: '47%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  portfolioImage: {
    width: '100%',
    height: 90,
  },
  portfolioImagePlaceholder: {
    width: '100%',
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  portfolioCategory: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  seeMoreBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  seeMoreText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  reviewItem: {
    paddingVertical: spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reviewAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
