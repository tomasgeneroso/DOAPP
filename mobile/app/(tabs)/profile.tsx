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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { LogoIcon } from '../../components/ui/Logo';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const { isDarkMode, setThemeMode, colors: themeColors } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);

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

  // Redirect to login if not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading]);

  // Show nothing while loading or redirecting
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <LogoIcon size="small" />
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Mi Perfil</Text>
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

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={styles.statValue}>{user?.jobsCompleted || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.secondary }]}>Trabajos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={styles.statValue}>{user?.contractsCompleted || 0}</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.secondary }]}>Contratos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={styles.statValue}>{user?.responseRate || 100}%</Text>
            <Text style={[styles.statLabel, { color: themeColors.text.secondary }]}>Respuesta</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={[styles.menuSection, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/dashboard')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>📊</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Dashboard</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Notificaciones</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/my-jobs')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>💼</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Agenda Do</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/contracts')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>📄</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Mis contratos</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/portfolio')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>🖼️</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Mi portfolio</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/blog')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>✍️</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Mis articulos</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/balance')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>💰</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Mi balance</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/payments')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>💳</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Historial de pagos</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/membership')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>⭐</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Membresia</Text>
            {!membershipBadge && (
              <View style={styles.upgradeTag}>
                <Text style={styles.upgradeTagText}>Mejorar</Text>
              </View>
            )}
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          {membershipBadge && (
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
              onPress={() => router.push('/pro-dashboard')}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>🏆</Text>
              <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Dashboard {membershipBadge.label}</Text>
              <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/referrals')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>🎁</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Referidos</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/settings')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>⚙️</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Configuracion</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomWidth: 0 }]}
            onPress={() => router.push('/help')}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>❓</Text>
            <Text style={[styles.menuText, { color: themeColors.text.primary }]}>Ayuda</Text>
            <Text style={[styles.menuArrow, { color: themeColors.text.muted }]}>›</Text>
          </TouchableOpacity>
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

        {/* App Version */}
        <Text style={[styles.versionText, { color: themeColors.text.muted }]}>DoApp v2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  scrollView: {
    flex: 1,
  },
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
  profileInfo: {
    flex: 1,
  },
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
  starIcon: {
    fontSize: fontSize.sm,
    marginRight: spacing.xs,
  },
  ratingText: {
    fontSize: fontSize.sm,
  },
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
  // Stats
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.primary[600],
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
  },
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
  menuArrow: {
    fontSize: fontSize.xl,
  },
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
  logoutIcon: {
    fontSize: fontSize.lg,
    marginRight: spacing.sm,
  },
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
  darkModeText: {
    flex: 1,
    fontSize: fontSize.base,
  },
  // Version
  versionText: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
