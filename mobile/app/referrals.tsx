import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Copy, Gift, Users, Star, CheckCircle } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { get } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  referralCode?: string;
  referralCodes?: string[];
  benefitsEarned: {
    freeContracts: number;
    discountActive: boolean;
    discountExpiresAt?: string;
  };
}

interface Referral {
  id: string;
  referredUser: { name: string; email: string };
  status: 'pending' | 'completed';
  completedAt?: string;
  createdAt: string;
}

export default function ReferralsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors: themeColors } = useTheme();

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchStats();
  }, [isAuthenticated, authLoading]);

  const fetchStats = async () => {
    try {
      const response = await get<any>('/referrals/stats');
      if (response.success) {
        setStats(response.stats);
        setReferrals(response.referrals || []);
      }
    } catch (error) {
      console.error('Error fetching referral stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, []);

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    Alert.alert('¡Copiado!', `Código ${code} copiado al portapapeles`);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  if (authLoading || loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Referidos</Text>
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Referidos</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Banner */}
        <View style={[styles.heroBanner, { backgroundColor: colors.primary[600] }]}>
          <Gift size={40} color="#fff" />
          <Text style={styles.heroTitle}>Invitá amigos y ganás</Text>
          <Text style={styles.heroSubtitle}>
            Compartí tu código, ellos obtienen 1 contrato gratis y vos ganás beneficios exclusivos
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Users size={20} color={colors.primary[500]} />
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>
              {stats?.totalReferrals || 0}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>Invitados</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <CheckCircle size={20} color={colors.success[500]} />
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>
              {stats?.completedReferrals || 0}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>Completados</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Star size={20} color={colors.secondary[500]} />
            <Text style={[styles.statValue, { color: themeColors.text.primary }]}>
              {stats?.benefitsEarned?.freeContracts || 0}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.text.muted }]}>Contratos gratis</Text>
          </View>
        </View>

        {/* Active Discount */}
        {stats?.benefitsEarned?.discountActive && (
          <View style={[styles.discountBanner, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
            <Star size={18} color={colors.success[600]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.discountTitle, { color: colors.success[700] }]}>
                ¡Tenés 3% de comisión activa!
              </Text>
              {stats.benefitsEarned.discountExpiresAt && (
                <Text style={[styles.discountExpiry, { color: colors.success[600] }]}>
                  Vence: {formatDate(stats.benefitsEarned.discountExpiresAt)}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Referral Codes */}
        <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
            Tus códigos de referido
          </Text>
          <Text style={[styles.sectionSubtitle, { color: themeColors.text.muted }]}>
            Cada código puede usarse una sola vez. Máximo 3 referidos.
          </Text>

          {(stats?.referralCode || (stats?.referralCodes && stats.referralCodes.length > 0)) ? (
            (stats.referralCodes || [stats.referralCode!]).map((code, index) => (
              <TouchableOpacity
                key={code}
                style={[styles.codeRow, { borderColor: themeColors.border }]}
                onPress={() => handleCopyCode(code)}
              >
                <View>
                  <Text style={[styles.codeLabel, { color: themeColors.text.muted }]}>
                    Tu código de referido
                  </Text>
                  <Text style={[styles.codeValue, { color: themeColors.text.primary }]}>{code}</Text>
                </View>
                <Copy size={18} color={colors.primary[500]} />
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.noCodesText, { color: themeColors.text.muted }]}>
              No tenés código disponible aún
            </Text>
          )}
        </View>

        {/* Benefits Info */}
        <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Beneficios por referido</Text>
          {[
            { emoji: '🎁', label: '1er referido completa contrato', benefit: '2 contratos gratis' },
            { emoji: '🎁', label: '2do referido completa contrato', benefit: '1 contrato gratis' },
            { emoji: '⭐', label: '3er referido completa contrato', benefit: '3% comisión por 1 mes' },
          ].map((item, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text style={styles.benefitEmoji}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.benefitLabel, { color: themeColors.text.secondary }]}>{item.label}</Text>
                <Text style={[styles.benefitValue, { color: themeColors.text.primary }]}>{item.benefit}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Referral History */}
        {referrals.length > 0 && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Historial</Text>
            {referrals.map((ref) => (
              <View key={ref.id} style={[styles.referralRow, { borderBottomColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.referralName, { color: themeColors.text.primary }]}>
                    {ref.referredUser?.name || 'Usuario'}
                  </Text>
                  <Text style={[styles.referralDate, { color: themeColors.text.muted }]}>
                    {formatDate(ref.createdAt)}
                  </Text>
                </View>
                <View style={[
                  styles.referralStatus,
                  { backgroundColor: ref.status === 'completed' ? colors.success[100] : colors.warning[100] }
                ]}>
                  <Text style={[
                    styles.referralStatusText,
                    { color: ref.status === 'completed' ? colors.success[700] : colors.warning[700] }
                  ]}>
                    {ref.status === 'completed' ? 'Completado' : 'Pendiente'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
  backButton: { padding: spacing.xs, width: 40 },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  heroBanner: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroTitle: { color: '#fff', fontSize: fontSize.xl, fontWeight: fontWeight.bold, textAlign: 'center' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  statLabel: { fontSize: fontSize.xs, textAlign: 'center' },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  discountTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  discountExpiry: { fontSize: fontSize.xs, marginTop: 2 },
  section: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  sectionSubtitle: { fontSize: fontSize.xs, marginBottom: spacing.md },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  codeLabel: { fontSize: fontSize.xs, marginBottom: 2 },
  codeValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, letterSpacing: 2 },
  noCodesText: { fontSize: fontSize.sm },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  benefitEmoji: { fontSize: 20 },
  benefitLabel: { fontSize: fontSize.xs, marginBottom: 2 },
  benefitValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  referralName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  referralDate: { fontSize: fontSize.xs, marginTop: 2 },
  referralStatus: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  referralStatusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
});
