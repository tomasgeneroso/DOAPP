import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { LogoIcon } from '../../components/ui/Logo';
import { get } from '../../services/api';

interface DashboardStats {
  totalEarnings: number;
  totalSpent: number;
  activeContracts: number;
  completedContracts: number;
  pendingProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  totalProposals: number;
  postedJobs: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const { isDarkMode, setThemeMode, colors: themeColors } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalEarnings: 0,
    totalSpent: 0,
    activeContracts: 0,
    completedContracts: 0,
    pendingProposals: 0,
    approvedProposals: 0,
    rejectedProposals: 0,
    totalProposals: 0,
    postedJobs: 0,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (user?.id) {
      fetchDashboardStats();
    }
  }, [user?.id]);

  const fetchDashboardStats = async () => {
    try {
      setStatsLoading(true);
      const [contractsRes, proposalsRes, jobsRes] = await Promise.all([
        get<any>('/contracts'),
        get<any>('/proposals'),
        get<any>('/jobs?limit=100'),
      ]);

      const contracts = contractsRes.contracts || [];
      const proposals = proposalsRes.proposals || [];
      const jobs = jobsRes.jobs || [];

      const earnings = contracts
        .filter((c: any) => c.doer?.id === user?.id && c.status === 'completed')
        .reduce((sum: number, c: any) => sum + (c.price || 0), 0);

      const spent = contracts
        .filter((c: any) => c.client?.id === user?.id && c.status === 'completed')
        .reduce((sum: number, c: any) => sum + (c.totalPrice || 0), 0);

      const active = contracts.filter((c: any) => {
        const isParty = c.client?.id === user?.id || c.doer?.id === user?.id;
        return isParty && ['pending', 'accepted', 'in_progress', 'awaiting_confirmation'].includes(c.status);
      }).length;

      const completed = contracts.filter((c: any) => {
        const isParty = c.client?.id === user?.id || c.doer?.id === user?.id;
        return isParty && c.status === 'completed';
      }).length;

      const sentProposals = proposals.filter((p: any) => p.freelancer?.id === user?.id || p.doer?.id === user?.id);
      const pending = sentProposals.filter((p: any) => p.status === 'pending').length;
      const approved = sentProposals.filter((p: any) => p.status === 'approved').length;
      const rejected = sentProposals.filter((p: any) => p.status === 'rejected' || p.status === 'withdrawn').length;

      const postedJobs = jobs.filter((j: any) =>
        j.clientId === user?.id || j.client?.id === user?.id
      ).length;

      setStats({
        totalEarnings: earnings,
        totalSpent: spent,
        activeContracts: active,
        completedContracts: completed,
        pendingProposals: pending,
        approvedProposals: approved,
        rejectedProposals: rejected,
        totalProposals: sentProposals.length,
        postedJobs,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesion',
      'Estas seguro que queres cerrar sesion?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesion',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoggingOut(true);
              await logout();
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Logout error:', error);
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

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

  const membershipBadge = getMembershipBadge();
  const isFreeUser = !user?.membershipType || user?.membershipType === 'free';
  const balance = user?.balance || 0;
  const freeContractsRemaining = user?.freeContractsRemaining || 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <LogoIcon size="small" />
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Dashboard</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}

          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.userName, { color: themeColors.text.primary }]}>{user?.name || 'Usuario'}</Text>
              {membershipBadge && (
                <View style={[styles.membershipBadge, { backgroundColor: membershipBadge.color }]}>
                  <Text style={styles.membershipBadgeText}>{membershipBadge.label}</Text>
                </View>
              )}
            </View>
            {user?.username && (
              <Text style={[styles.userHandle, { color: themeColors.text.secondary }]}>@{user.username}</Text>
            )}
            <View style={styles.ratingRow}>
              <Text style={styles.starIcon}>⭐</Text>
              <Text style={[styles.ratingText, { color: themeColors.text.secondary }]}>
                {Number(user?.rating || 5).toFixed(1)} · {user?.reviewsCount || 0} opiniones
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push('/edit-profile')}
            activeOpacity={0.7}
          >
            <Text style={styles.editButtonText}>Editar</Text>
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <TouchableOpacity
          style={[styles.balanceCard, { backgroundColor: balance >= 0 ? '#10b981' : '#ef4444' }]}
          onPress={() => router.push('/balance')}
          activeOpacity={0.9}
        >
          <View style={styles.balanceContent}>
            <View>
              <Text style={styles.balanceLabel}>{balance >= 0 ? 'Saldo disponible' : 'Saldo deudor'}</Text>
              <Text style={styles.balanceAmount}>
                {balance >= 0
                  ? `$${balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                  : `-$${Math.abs(balance).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                } ARS
              </Text>
              <Text style={styles.balanceSubtext}>{balance >= 0 ? '↑ Balance positivo' : '↓ Trabajos pausados'}</Text>
            </View>
            <Text style={styles.balanceIcon}>💰</Text>
          </View>
          {balance >= 0 && (
            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => router.push('/balance?tab=withdrawals')}
              activeOpacity={0.8}
            >
              <Text style={styles.withdrawBtnText}>↓ Retirar saldo</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Dashboard Stats */}
        {statsLoading ? (
          <View style={[styles.loadingCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <ActivityIndicator color={colors.primary[500]} />
            <Text style={[styles.loadingText, { color: themeColors.text.secondary }]}>Cargando estadísticas...</Text>
          </View>
        ) : (
          <>
            {/* Finanzas */}
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Finanzas</Text>
            <View style={styles.twoColGrid}>
              <TouchableOpacity
                style={[styles.statCardLarge, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/balance')}
                activeOpacity={0.8}
              >
                <View style={[styles.statIconBg, { backgroundColor: '#d1fae5' }]}>
                  <Text style={styles.statIconEmoji}>📈</Text>
                </View>
                <Text style={[styles.statCardLabel, { color: themeColors.text.secondary }]}>Ganancias</Text>
                <Text style={[styles.statCardValue, { color: '#10b981' }]}>
                  ${stats.totalEarnings.toLocaleString('es-AR')}
                </Text>
                <Text style={[styles.statCardDesc, { color: themeColors.text.muted }]}>Sin comisiones</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCardLarge, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/contracts')}
                activeOpacity={0.8}
              >
                <View style={[styles.statIconBg, { backgroundColor: '#fee2e2' }]}>
                  <Text style={styles.statIconEmoji}>📉</Text>
                </View>
                <Text style={[styles.statCardLabel, { color: themeColors.text.secondary }]}>Gastos</Text>
                <Text style={[styles.statCardValue, { color: '#ef4444' }]}>
                  ${stats.totalSpent.toLocaleString('es-AR')}
                </Text>
                <Text style={[styles.statCardDesc, { color: themeColors.text.muted }]}>Con comisión incluida</Text>
              </TouchableOpacity>
            </View>

            {/* Trabajos y Contratos */}
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Trabajos y Contratos</Text>
            <View style={styles.threeColGrid}>
              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/my-jobs')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#6366f1' }]}>{stats.postedJobs}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Publicados</Text>
                {freeContractsRemaining > 0 && (
                  <Text style={[styles.statSmallBadge, { color: '#10b981' }]}>{freeContractsRemaining} gratis</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/contracts')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#0ea5e9' }]}>{stats.activeContracts}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Activos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/contracts?status=completed')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#10b981' }]}>{stats.completedContracts}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Completados</Text>
              </TouchableOpacity>
            </View>

            {/* Propuestas */}
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Propuestas</Text>
            <View style={styles.twoColGrid}>
              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/proposals')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#8b5cf6' }]}>{stats.totalProposals}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Total</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/proposals?status=pending')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#f59e0b' }]}>{stats.pendingProposals}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Pendientes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/proposals?status=approved')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#14b8a6' }]}>{stats.approvedProposals}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Aprobadas</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCardSmall, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => router.push('/proposals?status=rejected')}
                activeOpacity={0.8}
              >
                <Text style={[styles.statSmallValue, { color: '#f43f5e' }]}>{stats.rejectedProposals}</Text>
                <Text style={[styles.statSmallLabel, { color: themeColors.text.secondary }]}>Rechazadas</Text>
              </TouchableOpacity>
            </View>

            {/* Ratings */}
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Valoraciones</Text>
            <View style={[styles.ratingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <RatingRow label="Calidad de trabajo" value={user?.workQualityRating || user?.rating || 5} color="#10b981" />
              <RatingRow label="Como Doer" value={user?.workerRating || user?.rating || 5} color="#0ea5e9" />
              <RatingRow label="Experiencia" value={user?.contractRating || user?.rating || 5} color="#8b5cf6" />
            </View>

            {/* Membership / Upgrade */}
            {isFreeUser && (
              <TouchableOpacity
                style={styles.upgradeCard}
                onPress={() => router.push('/membership')}
                activeOpacity={0.85}
              >
                <View style={styles.upgradeHeader}>
                  <Text style={styles.upgradeLock}>🔒</Text>
                  <View>
                    <Text style={styles.upgradeTitle}>Mejora tu plan</Text>
                    <Text style={styles.upgradeSubtitle}>Desbloquea el potencial de DOAPP</Text>
                  </View>
                </View>
                <View style={styles.upgradePlans}>
                  <View style={styles.upgradePlan}>
                    <Text style={styles.upgradePlanName}>👑 PRO</Text>
                    <Text style={styles.upgradePlanPrice}>$4.999 ARS/mes</Text>
                    <Text style={styles.upgradePlanFeature}>3% comisión</Text>
                  </View>
                  <View style={[styles.upgradePlan, styles.upgradePlanHighlight]}>
                    <Text style={styles.upgradePlanName}>✨ SUPER PRO</Text>
                    <Text style={styles.upgradePlanPrice}>$8.999 ARS/mes</Text>
                    <Text style={styles.upgradePlanFeature}>1% comisión</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Free contracts remaining */}
            {freeContractsRemaining > 0 && (
              <View style={[styles.freeContractsCard, { backgroundColor: themeColors.card, borderColor: '#10b981' }]}>
                <Text style={styles.freeContractsEmoji}>🎁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.freeContractsTitle, { color: themeColors.text.primary }]}>
                    {freeContractsRemaining} contratos gratis disponibles
                  </Text>
                  <Text style={[styles.freeContractsSubtitle, { color: themeColors.text.secondary }]}>
                    Sin comisión en tus próximos contratos
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Menu Items */}
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Cuenta</Text>
        <View style={[styles.menuSection, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <MenuItem icon="🔔" label="Notificaciones" onPress={() => router.push('/notifications')} themeColors={themeColors} />
          <MenuItem icon="💼" label="Agenda Do" onPress={() => router.push('/my-jobs')} themeColors={themeColors} />
          <MenuItem icon="📄" label="Mis contratos" onPress={() => router.push('/contracts')} themeColors={themeColors} />
          <MenuItem icon="🖼️" label="Mi portfolio" onPress={() => router.push('/portfolio')} themeColors={themeColors} />
          <MenuItem icon="✍️" label="Mis articulos" onPress={() => router.push('/blog')} themeColors={themeColors} />
          <MenuItem icon="💰" label="Mi balance" onPress={() => router.push('/balance')} themeColors={themeColors} />
          <MenuItem icon="🏦" label="Retiro de saldo" onPress={() => router.push('/balance?tab=withdrawals')} themeColors={themeColors} />
          <MenuItem icon="💳" label="Historial de pagos" onPress={() => router.push('/payments')} themeColors={themeColors} />
          <MenuItem icon="⭐" label="Membresia" onPress={() => router.push('/membership')} themeColors={themeColors} badge={!membershipBadge ? 'Mejorar' : undefined} />
          {membershipBadge && (
            <MenuItem icon="🏆" label={`Dashboard ${membershipBadge.label}`} onPress={() => router.push('/pro-dashboard')} themeColors={themeColors} />
          )}
          <MenuItem icon="🎁" label="Referidos" onPress={() => router.push('/referrals')} themeColors={themeColors} />
          <MenuItem icon="⚙️" label="Configuracion" onPress={() => router.push('/settings')} themeColors={themeColors} />
          <MenuItem icon="❓" label="Ayuda" onPress={() => router.push('/help')} themeColors={themeColors} last />
        </View>

        {/* Dark Mode Toggle */}
        <View style={[styles.darkModeRow, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={styles.menuIcon}>🌙</Text>
          <Text style={[styles.darkModeText, { color: themeColors.text.primary }]}>Modo oscuro</Text>
          <Switch
            value={isDarkMode}
            onValueChange={() => setThemeMode(isDarkMode ? 'light' : 'dark')}
            trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
            thumbColor="#fff"
          />
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Cerrar sesion</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: themeColors.text.muted }]}>DoApp v2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function RatingRow({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors: themeColors } = useTheme();
  const stars = Math.round(Number(value) || 5);
  return (
    <View style={ratingStyles.row}>
      <Text style={[ratingStyles.label, { color: themeColors.text.secondary }]}>{label}</Text>
      <View style={ratingStyles.right}>
        <Text style={[ratingStyles.stars, { color }]}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</Text>
        <Text style={[ratingStyles.value, { color }]}>{Number(value || 5).toFixed(1)}</Text>
      </View>
    </View>
  );
}

function MenuItem({ icon, label, onPress, themeColors, badge, last }: {
  icon: string;
  label: string;
  onPress: () => void;
  themeColors: any;
  badge?: string;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, { borderBottomColor: themeColors.border }, last ? { borderBottomWidth: 0 } : {}]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={[styles.menuText, { color: themeColors.text.primary }]}>{label}</Text>
      {badge && (
        <View style={styles.upgradeTag}>
          <Text style={styles.upgradeTagText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
    </TouchableOpacity>
  );
}

const ratingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stars: {
    fontSize: fontSize.sm,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    minWidth: 28,
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  // Profile Card
  profileCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    marginRight: spacing.md,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.primary[600],
  },
  profileInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  userName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  membershipBadge: {
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
    marginBottom: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starIcon: { fontSize: fontSize.sm, marginRight: spacing.xs },
  ratingText: { fontSize: fontSize.sm },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary[500],
  },
  editButtonText: {
    color: colors.primary[600],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Balance Card
  balanceCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  balanceContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  balanceSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  balanceIcon: { fontSize: 40, opacity: 0.3 },
  withdrawBtn: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'flex-start',
  },
  withdrawBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Loading
  loadingCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loadingText: { fontSize: fontSize.sm },
  // Section title
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  // Stat grids
  twoColGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  threeColGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  statCardLarge: {
    flex: 1,
    minWidth: '45%',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statIconEmoji: { fontSize: 20 },
  statCardLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  statCardValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  statCardDesc: { fontSize: fontSize.xs },
  statCardSmall: {
    flex: 1,
    minWidth: '28%',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  statSmallValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  statSmallLabel: { fontSize: fontSize.xs, textAlign: 'center' },
  statSmallBadge: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, marginTop: 2 },
  // Ratings
  ratingsCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  // Upgrade card — dark theme
  upgradeCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: '#1e1b4b',
    borderWidth: 0,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  upgradeLock: { fontSize: 32 },
  upgradeTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#e9d5ff',
  },
  upgradeSubtitle: {
    fontSize: fontSize.sm,
    color: '#c4b5fd',
  },
  upgradePlans: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  upgradePlan: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  upgradePlanHighlight: {
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236,72,153,0.12)',
  },
  upgradePlanName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#f3f4f6',
    marginBottom: 2,
  },
  upgradePlanPrice: {
    fontSize: fontSize.xs,
    color: '#d1d5db',
    marginBottom: 2,
  },
  upgradePlanFeature: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: '#a78bfa',
  },
  // Free contracts
  freeContractsCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  freeContractsEmoji: { fontSize: 28 },
  freeContractsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  freeContractsSubtitle: { fontSize: fontSize.sm },
  // Menu
  menuSection: {
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  menuIcon: {
    fontSize: fontSize.lg,
    marginRight: spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: fontSize.base,
  },
  menuArrow: { fontSize: fontSize.xl },
  upgradeTag: {
    backgroundColor: colors.secondary[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  upgradeTagText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.danger[50],
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger[100],
  },
  logoutIcon: { fontSize: fontSize.lg, marginRight: spacing.sm },
  logoutText: {
    fontSize: fontSize.base,
    color: colors.danger[600],
    fontWeight: fontWeight.semibold,
  },
  // Dark Mode
  darkModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  darkModeText: { flex: 1, fontSize: fontSize.base },
  // Version
  versionText: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
