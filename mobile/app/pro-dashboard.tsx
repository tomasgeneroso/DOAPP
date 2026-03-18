import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Zap,
  Crown,
  TrendingUp,
  Calendar,
  Gift,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { get } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface UsageData {
  contractsUsed: number;
  contractsLimit: number;
  contractsRemaining: number;
  freeContractsRemaining: number;
  membershipExpiresAt: string | null;
}

export default function ProDashboardScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = async () => {
    try {
      const res = await get<any>('/membership/usage');
      if (res.success) {
        setUsage((res as any).data);
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsage();
  };

  const tier = user?.membershipTier || 'free';
  const isPro = tier === 'pro';
  const isSuperPro = tier === 'super_pro';
  const tierColor = isSuperPro ? '#8b5cf6' : colors.primary[600];
  const tierLabel = isSuperPro ? 'SUPER PRO' : 'PRO';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Sin fecha';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getProgressPercent = () => {
    if (!usage || usage.contractsLimit === 0) return 0;
    return Math.min((usage.contractsUsed / usage.contractsLimit) * 100, 100);
  };

  const benefits = isPro
    ? [
        'Comision fija del 3%',
        '1 contrato gratis por mes',
        'Badge PRO en tu perfil',
        'Estadisticas avanzadas',
        'Soporte prioritario',
      ]
    : [
        'Comision fija del 1%',
        '2 contratos gratis por mes',
        'Badge SUPER PRO en tu perfil',
        'Analytics avanzados',
        'Soporte VIP prioritario',
        'Destacado en busquedas',
      ];

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Dashboard {tierLabel}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={tierColor} />
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Dashboard {tierLabel}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tierColor} />}
      >
        {/* Tier Header */}
        <View style={[styles.tierCard, { backgroundColor: tierColor }]}>
          {isSuperPro ? <Crown size={32} color="#fff" /> : <Zap size={32} color="#fff" />}
          <Text style={styles.tierLabel}>Miembro {tierLabel}</Text>
          {usage?.membershipExpiresAt && (
            <Text style={styles.tierExpiry}>
              Vence: {formatDate(usage.membershipExpiresAt)}
            </Text>
          )}
        </View>

        {/* Contract Usage */}
        {usage && (
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <TrendingUp size={20} color={tierColor} />
              <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>
                Contratos gratis este mes
              </Text>
            </View>

            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: themeColors.slate[100] }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: tierColor, width: `${getProgressPercent()}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: themeColors.text.secondary }]}>
                {usage.contractsUsed} / {usage.contractsLimit} usados
              </Text>
            </View>

            <View style={styles.usageRow}>
              <View style={[styles.usageStat, { backgroundColor: themeColors.slate[50] }]}>
                <Text style={[styles.usageValue, { color: tierColor }]}>{usage.contractsRemaining}</Text>
                <Text style={[styles.usageLabel, { color: themeColors.text.muted }]}>Restantes</Text>
              </View>
              <View style={[styles.usageStat, { backgroundColor: themeColors.slate[50] }]}>
                <Text style={[styles.usageValue, { color: tierColor }]}>{usage.freeContractsRemaining}</Text>
                <Text style={[styles.usageLabel, { color: themeColors.text.muted }]}>Bonus total</Text>
              </View>
            </View>
          </View>
        )}

        {/* Next Reset */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <Calendar size={20} color={tierColor} />
            <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>
              Proximo reinicio
            </Text>
          </View>
          <Text style={[styles.resetText, { color: themeColors.text.secondary }]}>
            Los contratos gratis se reinician el 1 de cada mes. Usa tus contratos restantes antes de esa fecha.
          </Text>
        </View>

        {/* Benefits */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <Gift size={20} color={tierColor} />
            <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>
              Tus beneficios
            </Text>
          </View>
          {benefits.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={[styles.benefitDot, { backgroundColor: tierColor }]} />
              <Text style={[styles.benefitText, { color: themeColors.text.secondary }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* Upgrade CTA (for PRO users) */}
        {isPro && (
          <TouchableOpacity
            style={[styles.upgradeCard, { backgroundColor: '#8b5cf620', borderColor: '#8b5cf6' }]}
            onPress={() => router.push('/membership')}
            activeOpacity={0.7}
          >
            <Crown size={24} color="#8b5cf6" />
            <View style={styles.upgradeInfo}>
              <Text style={[styles.upgradeTitle, { color: '#8b5cf6' }]}>Subir a SUPER PRO</Text>
              <Text style={[styles.upgradeDesc, { color: themeColors.text.secondary }]}>
                Obtene 1% de comision y 2 contratos gratis por mes
              </Text>
            </View>
            <ChevronRight size={20} color="#8b5cf6" />
          </TouchableOpacity>
        )}

        {/* Manage Membership */}
        <TouchableOpacity
          style={[styles.manageBtn, { borderColor: themeColors.border }]}
          onPress={() => router.push('/membership')}
          activeOpacity={0.7}
        >
          <Text style={[styles.manageBtnText, { color: themeColors.text.secondary }]}>
            Administrar membresia
          </Text>
        </TouchableOpacity>
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
  tierCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  tierLabel: { color: '#fff', fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  tierExpiry: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  progressContainer: { marginBottom: spacing.md },
  progressBar: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  progressText: { fontSize: fontSize.sm, textAlign: 'right' },
  usageRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  usageStat: {
    flex: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  usageValue: { fontSize: fontSize.xxl || 28, fontWeight: fontWeight.bold },
  usageLabel: { fontSize: fontSize.xs, marginTop: spacing.xs },
  resetText: { fontSize: fontSize.sm, lineHeight: 20 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  benefitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  benefitText: { fontSize: fontSize.sm, flex: 1 },
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  upgradeInfo: { flex: 1 },
  upgradeTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  upgradeDesc: { fontSize: fontSize.sm, marginTop: 2 },
  manageBtn: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  manageBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
