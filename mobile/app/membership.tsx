import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Star, Zap, Check, Crown } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface PricingTier {
  name: string;
  price?: number;
  priceARS?: number;
  currency: string;
  commissionRate?: number;
  benefits: string[];
}

interface Pricing {
  free: PricingTier;
  pro: PricingTier;
  superPro: PricingTier;
}

export default function MembershipScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const res = await get<{ pricing: Pricing }>('/membership/pricing', false);
        if (res.success) {
          setPricing((res as any).pricing);
        }
      } catch (error) {
        console.error('Error fetching pricing:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPricing();
  }, []);

  const handleUpgrade = async (plan: 'pro' | 'super_pro') => {
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
    setUpgrading(plan);
    try {
      const res = await post<any>('/membership/create-payment', { membershipType: plan });
      if (res.success) {
        const initPoint = (res as any).initPoint || (res as any).data?.initPoint;
        if (initPoint) {
          await Linking.openURL(initPoint);
        } else {
          Alert.alert('Error', 'No se pudo obtener el link de pago');
        }
      } else {
        Alert.alert('Error', (res as any).message || 'No se pudo iniciar el pago');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setUpgrading(null);
    }
  };

  const currentPlan = user?.membershipType || 'free';

  const getMembershipLabel = (type: string) => {
    switch (type) {
      case 'pro': return 'PRO';
      case 'super_pro': return 'SUPER PRO';
      default: return 'Free';
    }
  };

  const formatARS = (amount: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Membresía</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Membresía</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Current plan */}
        <View style={[styles.currentPlanCard, { backgroundColor: themeColors.primary[600] }]}>
          <Crown size={28} color="#fff" />
          <Text style={styles.currentPlanLabel}>Tu plan actual</Text>
          <Text style={styles.currentPlanName}>{getMembershipLabel(currentPlan)}</Text>
          {user?.freeContractsRemaining !== undefined && user.freeContractsRemaining > 0 && (
            <Text style={styles.currentPlanSub}>
              {user.freeContractsRemaining} contratos gratis restantes
            </Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Elegí tu plan</Text>

        {/* FREE */}
        <View style={[
          styles.planCard,
          { backgroundColor: themeColors.card, borderColor: currentPlan === 'free' ? themeColors.primary[600] : themeColors.border },
          currentPlan === 'free' && styles.planCardActive,
        ]}>
          <View style={styles.planHeader}>
            <View style={[styles.planIconWrap, { backgroundColor: themeColors.slate[100] }]}>
              <Star size={20} color={themeColors.text.secondary} />
            </View>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color: themeColors.text.primary }]}>Free</Text>
              <Text style={[styles.planPrice, { color: themeColors.text.primary }]}>$0</Text>
            </View>
            {currentPlan === 'free' && (
              <View style={[styles.activeBadge, { backgroundColor: themeColors.primary[50] }]}>
                <Text style={[styles.activeBadgeText, { color: themeColors.primary[600] }]}>Actual</Text>
              </View>
            )}
          </View>
          <View style={styles.benefitsList}>
            {(pricing?.free.benefits || []).map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Check size={14} color={colors.success[500]} />
                <Text style={[styles.benefitText, { color: themeColors.text.secondary }]}>{b}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.volumeBox, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border }]}>
            <Text style={[styles.volumeTitle, { color: themeColors.text.primary }]}>Comisión</Text>
            <View style={styles.volumeRow}>
              <Text style={[styles.volumeDesc, { color: themeColors.text.secondary }]}>Tasa fija</Text>
              <Text style={[styles.volumeRate, { color: themeColors.primary[600] }]}>8%</Text>
            </View>
            <Text style={[styles.volumeMin, { color: themeColors.text.muted }]}>
              Mínimo: {formatARS(1000)} por contrato
            </Text>
          </View>
        </View>

        {/* PRO */}
        <View style={[
          styles.planCard,
          { backgroundColor: themeColors.card, borderColor: currentPlan === 'pro' ? colors.primary[600] : themeColors.border },
          currentPlan === 'pro' && styles.planCardActive,
        ]}>
          <View style={styles.planHeader}>
            <View style={[styles.planIconWrap, { backgroundColor: colors.primary[50] }]}>
              <Zap size={20} color={colors.primary[600]} />
            </View>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color: themeColors.text.primary }]}>PRO</Text>
              <Text style={[styles.planPrice, { color: colors.primary[600] }]}>
                {pricing?.pro.priceARS ? formatARS(pricing.pro.priceARS) : '...'}/mes
              </Text>
            </View>
            {currentPlan === 'pro' ? (
              <View style={[styles.activeBadge, { backgroundColor: colors.primary[50] }]}>
                <Text style={[styles.activeBadgeText, { color: colors.primary[600] }]}>Actual</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.upgradeBtn, { backgroundColor: colors.primary[600] }, upgrading === 'pro' && styles.upgradeDisabled]}
                onPress={() => handleUpgrade('pro')}
                disabled={!!upgrading || currentPlan === 'super_pro'}
              >
                {upgrading === 'pro' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.upgradeBtnText}>Mejorar</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.benefitsList}>
            {(pricing?.pro.benefits || []).map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Check size={14} color={colors.primary[500]} />
                <Text style={[styles.benefitText, { color: themeColors.text.secondary }]}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SUPER PRO */}
        <View style={[
          styles.planCard,
          { backgroundColor: themeColors.card, borderColor: currentPlan === 'super_pro' ? colors.secondary[500] : themeColors.border },
          currentPlan === 'super_pro' && styles.planCardActive,
        ]}>
          <View style={styles.planHeader}>
            <View style={[styles.planIconWrap, { backgroundColor: colors.secondary[50] }]}>
              <Crown size={20} color={colors.secondary[500]} />
            </View>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color: themeColors.text.primary }]}>SUPER PRO</Text>
              <Text style={[styles.planPrice, { color: colors.secondary[500] }]}>
                {pricing?.superPro.priceARS ? formatARS(pricing.superPro.priceARS) : '...'}/mes
              </Text>
            </View>
            {currentPlan === 'super_pro' ? (
              <View style={[styles.activeBadge, { backgroundColor: colors.secondary[50] }]}>
                <Text style={[styles.activeBadgeText, { color: colors.secondary[500] }]}>Actual</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.upgradeBtn, { backgroundColor: colors.secondary[500] }, upgrading === 'super_pro' && styles.upgradeDisabled]}
                onPress={() => handleUpgrade('super_pro')}
                disabled={!!upgrading}
              >
                {upgrading === 'super_pro' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.upgradeBtnText}>Mejorar</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.benefitsList}>
            {(pricing?.superPro.benefits || []).map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Check size={14} color={colors.secondary[500]} />
                <Text style={[styles.benefitText, { color: themeColors.text.secondary }]}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* PRO Dashboard Link */}
        {(currentPlan === 'pro' || currentPlan === 'super_pro') && (
          <TouchableOpacity
            style={[styles.dashboardLink, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => router.push('/pro-dashboard')}
            activeOpacity={0.7}
          >
            <Crown size={20} color={currentPlan === 'super_pro' ? '#8b5cf6' : colors.primary[600]} />
            <Text style={[styles.dashboardLinkText, { color: themeColors.text.primary }]}>
              Ver Dashboard {currentPlan === 'super_pro' ? 'SUPER PRO' : 'PRO'}
            </Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.disclaimer, { color: themeColors.text.muted }]}>
          Los pagos se procesan mediante MercadoPago. Podés cancelar en cualquier momento desde tu cuenta.
        </Text>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: spacing.lg, paddingBottom: 50 },
  currentPlanCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  currentPlanLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  currentPlanName: { color: '#fff', fontSize: fontSize.xxl || 28, fontWeight: fontWeight.bold },
  currentPlanSub: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md },
  planCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    padding: spacing.lg,
    marginBottom: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  planCardActive: { borderWidth: 2 },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  planIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planInfo: { flex: 1 },
  planName: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
  planPrice: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: 2 },
  activeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  activeBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  upgradeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    minWidth: 80,
    alignItems: 'center',
  },
  upgradeDisabled: { opacity: 0.6 },
  upgradeBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  benefitsList: { gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitText: { fontSize: fontSize.sm, flex: 1, lineHeight: 20 },
  volumeBox: {
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  volumeTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  volumeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  volumeDesc: { fontSize: fontSize.xs },
  volumeRate: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  volumeMin: { fontSize: fontSize.xs, marginTop: spacing.xs },
  dashboardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  dashboardLinkText: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  menuArrow: {
    fontSize: fontSize.xl,
    color: colors.slate[400],
  },
  disclaimer: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
});
