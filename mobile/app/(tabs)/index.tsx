import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PlusCircle, MessageCircle, Lock, CheckCircle, MapPin, Calendar, Star, Package, Briefcase, User, Sun, Moon, Search, ArrowRight } from 'lucide-react-native';
import { Job } from '../../types';
import { getJobs } from '../../services/jobs';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import Logo from '../../components/ui/Logo';

type HomeTab = 'jobs' | 'users';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { isDarkMode, toggleTheme, colors: themeColors } = useTheme();

  const [activeTab, setActiveTab] = useState<HomeTab>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchJobs = async (pageNum: number = 1, refresh: boolean = false) => {
    try {
      const response = await getJobs({ page: pageNum, limit: 10, status: 'open' });

      if (response.success && response.data) {
        if (refresh || pageNum === 1) {
          setJobs(response.data);
        } else {
          setJobs((prev) => [...prev, ...response.data]);
        }
        setHasMore(response.pagination?.page < response.pagination?.pages);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchJobs(1, true);
  }, []);

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchJobs(nextPage);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const renderHero = () => (
    <View style={[styles.heroSection, { backgroundColor: themeColors.card }]}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Logo size="xlarge" />
      </View>

      <Text style={[styles.heroTitle, { color: themeColors.text.primary }]}>
        {user ? (
          `¡Hola de nuevo, ${user.name?.split(' ')[0]}!`
        ) : (
          <>
            Publicá el servicio que necesites o{' '}
            <Text style={[styles.heroTitleAccent, { color: themeColors.primary[600] }]}>buscá oportunidades</Text>
            {' '}para ofrecer tus servicios.
          </>
        )}
      </Text>
      <Text style={[styles.heroSubtitle, { color: themeColors.text.secondary }]}>
        {user
          ? '¿Listo para empezar un nuevo proyecto o buscar oportunidades?'
          : 'En DoApp, conectamos personas que necesitan servicios con quienes saben hacerlos. Garantizamos que el trabajo se complete o te devolvemos el dinero.'}
      </Text>

      {!user && (
        <Text style={[styles.heroSmallText, { color: themeColors.text.muted }]}>
          Nos aseguramos que cada acuerdo se cumpla por ambas partes. Publicá un trabajo, negociá directamente con el profesional y pagá automáticamente solo cuando todo esté verificado.
        </Text>
      )}

      {!isAuthenticated && (
        <View style={styles.heroButtons}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: themeColors.primary[600] }]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.primaryButtonText}>Registrate gratis</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderHowItWorksClient = () => (
    <View style={[styles.howItWorksCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.howItWorksTitle, { color: themeColors.text.primary }]}>¿Necesitás un servicio?</Text>
      <Text style={[styles.howItWorksSubtitle, { color: themeColors.text.secondary }]}>Publicá tu trabajo y encontrá profesionales</Text>

      <View style={styles.stepsContainer}>
        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: colors.primary[500] }]}>
            <PlusCircle size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Publicá</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Creá tu trabajo con los detalles del servicio que necesitás</Text>
        </View>

        <View style={styles.stepArrow}>
          <ArrowRight size={20} color={themeColors.text.muted} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: colors.secondary[500] }]}>
            <MessageCircle size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={[styles.stepNumber, { backgroundColor: colors.secondary[600] }]}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Elegí</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Recibí propuestas y elegí al mejor profesional</Text>
        </View>

        <View style={styles.stepArrow}>
          <ArrowRight size={20} color={themeColors.text.muted} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: '#8b5cf6' }]}>
            <Lock size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={[styles.stepNumber, { backgroundColor: '#8b5cf6' }]}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Pagá Seguro</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Tu dinero queda en garantía hasta completar</Text>
        </View>

        <View style={styles.stepArrow}>
          <ArrowRight size={20} color={themeColors.text.muted} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: colors.success[500] }]}>
            <CheckCircle size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={[styles.stepNumber, { backgroundColor: colors.success[600] }]}>
            <Text style={styles.stepNumberText}>4</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>¡Listo!</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Confirmá y el pago se libera automáticamente</Text>
        </View>
      </View>
    </View>
  );

  const renderHowItWorksWorker = () => (
    <View style={[styles.howItWorksCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.howItWorksTitle, { color: themeColors.text.primary }]}>¿Ofrecés servicios?</Text>
      <Text style={[styles.howItWorksSubtitle, { color: themeColors.text.secondary }]}>Encontrá trabajos y empezá a ganar</Text>

      <View style={styles.stepsContainer}>
        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: colors.primary[500] }]}>
            <Search size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Buscá</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Explorá trabajos que se ajusten a tus habilidades</Text>
        </View>

        <View style={styles.stepArrow}>
          <ArrowRight size={20} color={themeColors.text.muted} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: colors.secondary[500] }]}>
            <MessageCircle size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={[styles.stepNumber, { backgroundColor: colors.secondary[600] }]}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Aplicá</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Enviá tu propuesta con tu mejor oferta</Text>
        </View>

        <View style={styles.stepArrow}>
          <ArrowRight size={20} color={themeColors.text.muted} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: '#8b5cf6' }]}>
            <Briefcase size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={[styles.stepNumber, { backgroundColor: '#8b5cf6' }]}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Trabajá</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Realizá el trabajo con tranquilidad</Text>
        </View>

        <View style={styles.stepArrow}>
          <ArrowRight size={20} color={themeColors.text.muted} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: colors.success[500] }]}>
            <CheckCircle size={24} color="#fff" strokeWidth={2} />
          </View>
          <View style={[styles.stepNumber, { backgroundColor: colors.success[600] }]}>
            <Text style={styles.stepNumberText}>4</Text>
          </View>
          <Text style={[styles.stepTitle, { color: themeColors.text.primary }]}>Cobrá</Text>
          <Text style={[styles.stepDescription, { color: themeColors.text.secondary }]}>Recibí tu pago de forma segura y garantizada</Text>
        </View>
      </View>
    </View>
  );

  const renderSecurityBanner = () => (
    <View style={[styles.securityBanner, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
      <View style={styles.securityIconContainer}>
        <Lock size={24} color={themeColors.primary[600]} strokeWidth={2} />
      </View>
      <View style={styles.securityContent}>
        <Text style={[styles.securityTitle, { color: themeColors.text.primary }]}>En DoApp, cada contrato queda protegido:</Text>
        <Text style={[styles.securityText, { color: themeColors.text.secondary }]}>
          el dinero se mantiene en garantía hasta que ambas partes confirman que el trabajo fue entregado.
        </Text>
      </View>
    </View>
  );

  const renderJob = ({ item }: { item: Job }) => {
    const client = typeof item.client === 'object' ? item.client : null;

    return (
      <TouchableOpacity
        style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => router.push(`/job/${item._id || item.id}`)}
        activeOpacity={0.7}
      >
        {/* Price Badge */}
        <View style={[styles.priceBadge, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
          <Text style={[styles.priceText, { color: themeColors.primary[600] }]}>{formatPrice(item.budget || item.price)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Client Rating */}
        {client && (
          <View style={styles.ratingContainer}>
            <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} strokeWidth={2} />
            <Text style={[styles.ratingText, { color: themeColors.text.secondary }]}>
              {(client.rating || 5).toFixed(1)} ({client.reviewsCount || 0})
            </Text>
          </View>
        )}

        {/* Description */}
        <Text style={[styles.jobDescription, { color: themeColors.text.secondary }]} numberOfLines={2}>
          {item.description || item.summary}
        </Text>

        {/* Footer */}
        <View style={styles.jobFooter}>
          <View style={styles.locationRow}>
            <MapPin size={16} color={themeColors.text.muted} strokeWidth={2} />
            <Text style={[styles.metaText, { color: themeColors.text.muted }]}>{item.neighborhood || item.location}</Text>
          </View>
          <View style={styles.dateRow}>
            <Calendar size={16} color={themeColors.text.muted} strokeWidth={2} />
            <Text style={[styles.metaText, { color: themeColors.text.muted }]}>{formatDate(item.startDate)}</Text>
          </View>
        </View>

        {/* Hover Button Effect - Always visible on mobile */}
        <View style={[styles.viewDetailsButton, { backgroundColor: themeColors.primary[600] }]}>
          <Text style={styles.viewDetailsText}>Ver detalles</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <>
      {renderHero()}
      {renderHowItWorksClient()}
      {renderHowItWorksWorker()}
      {renderSecurityBanner()}

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <Text style={[styles.tabsLabel, { color: themeColors.text.secondary }]}>Buscar:</Text>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'jobs' && styles.tabActive]}
          onPress={() => setActiveTab('jobs')}
        >
          <Briefcase size={16} color={activeTab === 'jobs' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: themeColors.text.secondary }, activeTab === 'jobs' && styles.tabTextActive]}>
            Trabajos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <User size={16} color={activeTab === 'users' ? themeColors.primary[600] : themeColors.text.secondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: themeColors.text.secondary }, activeTab === 'users' && styles.tabTextActive]}>
            Perfiles
          </Text>
        </TouchableOpacity>
      </View>

      {/* Protection Banner */}
      <View style={[styles.protectionBanner, { backgroundColor: isDarkMode ? themeColors.primary[50] : colors.primary[50] }]}>
        <View style={styles.protectionIconContainer}>
          <Lock size={20} color={themeColors.primary[600]} strokeWidth={2} />
        </View>
        <View style={styles.protectionContent}>
          <Text style={[styles.protectionTitle, { color: themeColors.text.primary }]}>
            En Doers, cada contrato queda protegido:
          </Text>
          <Text style={[styles.protectionText, { color: themeColors.text.secondary }]}>
            el dinero se mantiene en garantía hasta que ambas partes confirman que el trabajo fue entregado. Así, vos y el profesional están seguros en todo momento.
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Trabajos Disponibles</Text>
    </>
  );

  const renderFooter = () => {
    // Footer matching web design
    return (
      <View style={styles.footer}>
        {hasMore && (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color={colors.primary[500]} />
          </View>
        )}

        <Text style={styles.footerBrand}>DOAPP</Text>
        <Text style={styles.footerDescription}>
          La plataforma de freelancing más confiable de Argentina.{'\n'}
          Conectamos talento con oportunidades.
        </Text>

        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>Pagos procesados de forma segura con:</Text>
          <View style={styles.paymentLogos}>
            <View style={styles.mpLogoContainer}>
              <Text style={styles.mpLogo}>mercado pago</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading && jobs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={styles.loadingText}>Cargando trabajos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Top Auth Bar */}
      {!isAuthenticated && (
        <View style={[styles.topAuthBar, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            {isDarkMode ? (
              <Sun size={20} color={themeColors.text.secondary} strokeWidth={2} />
            ) : (
              <Moon size={20} color={themeColors.text.secondary} strokeWidth={2} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topLoginButton, { borderColor: themeColors.primary[600] }]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={[styles.topLoginText, { color: themeColors.primary[600] }]}>Iniciar Sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topRegisterButton, { backgroundColor: themeColors.primary[600] }]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.topRegisterText}>Registrarse</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={jobs}
        renderItem={renderJob}
        keyExtractor={(item) => item._id || item.id || String(Math.random())}
        contentContainerStyle={[styles.listContent, { backgroundColor: themeColors.background }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[themeColors.primary[600]]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.background }]}>
            <Package size={48} color={themeColors.text.muted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>No hay trabajos disponibles</Text>
            <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>Vuelve a intentar más tarde</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  // Top Auth Bar
  topAuthBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  themeToggle: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 'auto',
  },
  topLoginButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  topLoginText: {
    color: colors.primary[600],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  topRegisterButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
  },
  topRegisterText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
  },
  tabsLabel: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    fontWeight: fontWeight.medium,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.primary[50],
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    fontWeight: fontWeight.medium,
  },
  tabTextActive: {
    color: colors.primary[600],
    fontWeight: fontWeight.semibold,
  },
  // Protection Banner
  protectionBanner: {
    flexDirection: 'row',
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary[100],
    gap: spacing.sm,
  },
  protectionIconContainer: {
    paddingTop: 2,
  },
  protectionContent: {
    flex: 1,
  },
  protectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary[900],
    marginBottom: 2,
  },
  protectionText: {
    fontSize: fontSize.xs,
    color: colors.primary[700],
    lineHeight: 16,
  },
  listContent: {
    padding: spacing.lg,
  },
  // Hero Section
  heroSection: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: spacing.xl,
  },
  heroTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 38,
  },
  heroTitleAccent: {
    color: colors.primary[600],
  },
  heroSubtitle: {
    fontSize: fontSize.base,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  heroSmallText: {
    fontSize: fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  heroButtons: {
    width: '100%',
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  secondaryButton: {
    backgroundColor: colors.secondary[500],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  // How It Works
  howItWorksCard: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  howItWorksTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  howItWorksSubtitle: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  stepsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  step: {
    width: '20%',
    minWidth: 70,
    alignItems: 'center',
    marginBottom: spacing.lg,
    position: 'relative',
  },
  stepArrow: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    position: 'absolute',
    top: -4,
    left: '25%',
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  stepTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  stepDescription: {
    fontSize: fontSize.xs,
    color: colors.slate[600],
    textAlign: 'center',
  },
  // Security Banner
  securityBanner: {
    flexDirection: 'row',
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  securityIconContainer: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary[900],
    marginBottom: spacing.xs,
  },
  securityText: {
    fontSize: fontSize.xs,
    color: colors.primary[700],
    lineHeight: 18,
  },
  // Section Title
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.lg,
  },
  // Job Card
  jobCard: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
    overflow: 'hidden',
  },
  priceBadge: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  priceText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  jobTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
    paddingRight: 80,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  ratingText: {
    fontSize: fontSize.xs,
    color: colors.slate[600],
  },
  jobDescription: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  jobFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.slate[500],
  },
  viewDetailsButton: {
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginHorizontal: -spacing.lg,
    marginBottom: -spacing.lg,
    alignItems: 'center',
  },
  viewDetailsText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.base,
    color: colors.slate[500],
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  // Footer
  footer: {
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['4xl'],
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    marginTop: spacing.xl,
  },
  footerBrand: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.md,
  },
  footerDescription: {
    fontSize: fontSize.sm,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  paymentSection: {
    alignItems: 'center',
    width: '100%',
  },
  paymentTitle: {
    fontSize: fontSize.xs,
    color: colors.slate[500],
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  paymentLogos: {
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  mpLogoContainer: {
    backgroundColor: '#00AAEF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  mpLogo: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.slate[500],
  },
});
