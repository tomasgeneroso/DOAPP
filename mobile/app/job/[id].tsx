import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  User,
  Clock,
  Star,
  Send,
  AlertCircle,
  CheckCircle,
  Users,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getJob } from '../../services/jobs';
import { createProposal, getProposalsByJob } from '../../services/proposals';
import { Job, Proposal, UserSummary } from '../../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDarkMode, colors: themeColors } = useTheme();
  const { user, isAuthenticated } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proposalMessage, setProposalMessage] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  const fetchJob = async () => {
    if (!id) return;

    try {
      const response = await getJob(id);
      if (response.success && response.data) {
        setJob(response.data.job);
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    }
  };

  const fetchProposals = async () => {
    if (!id || !isAuthenticated) return;

    try {
      const response = await getProposalsByJob(id);
      if (response.success && response.data) {
        setProposals(response.data.proposals);
        // Check if user has already applied
        const userProposal = response.data.proposals.find(
          (p) => {
            const doer = p.doer as UserSummary;
            return doer?._id === user?._id || doer?.id === user?._id;
          }
        );
        setHasApplied(!!userProposal);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchJob(), fetchProposals()]);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchJob(), fetchProposals()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleApply = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }

    if (!proposalMessage.trim()) {
      Alert.alert('Error', 'Por favor escribe un mensaje para tu propuesta');
      return;
    }

    setSubmitting(true);
    try {
      const response = await createProposal({
        jobId: id!,
        message: proposalMessage.trim(),
        proposedPrice: proposedPrice ? parseFloat(proposedPrice) : undefined,
      });

      if (response.success) {
        Alert.alert('Propuesta enviada', 'Tu propuesta ha sido enviada correctamente');
        setShowProposalForm(false);
        setProposalMessage('');
        setProposedPrice('');
        setHasApplied(true);
        fetchProposals();
      } else {
        Alert.alert('Error', response.message || 'No se pudo enviar la propuesta');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return colors.success[500];
      case 'in_progress':
        return colors.primary[500];
      case 'completed':
        return colors.slate[500];
      case 'cancelled':
      case 'paused':
        return colors.danger[500];
      default:
        return colors.warning[500];
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      open: 'Abierto',
      in_progress: 'En progreso',
      completed: 'Completado',
      cancelled: 'Cancelado',
      draft: 'Borrador',
      pending_payment: 'Pago pendiente',
      pending_approval: 'Esperando aprobación',
      paused: 'Pausado',
      suspended: 'Suspendido',
    };
    return statusMap[status] || status;
  };

  const isOwner = user && job && (
    (job.client as UserSummary)?._id === user._id ||
    (job.client as UserSummary)?.id === user._id ||
    job.postedBy === user._id
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color={colors.danger[500]} />
          <Text style={[styles.errorText, { color: themeColors.text.primary }]}>
            Trabajo no encontrado
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const client = job.client as UserSummary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {job.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(job.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(job.status) }]}>
            {getStatusText(job.status)}
          </Text>
        </View>

        {/* Title & Price */}
        <Text style={[styles.title, { color: themeColors.text.primary }]}>{job.title}</Text>
        <Text style={[styles.price, { color: themeColors.primary[600] }]}>
          {formatPrice(job.price || job.budget)}
        </Text>

        {/* Category */}
        <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary[50] }]}>
          <Text style={[styles.categoryText, { color: themeColors.primary[600] }]}>
            {job.category}
          </Text>
        </View>

        {/* Info Cards */}
        <View style={[styles.infoCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.infoRow}>
            <MapPin size={18} color={themeColors.text.secondary} />
            <Text style={[styles.infoText, { color: themeColors.text.primary }]}>
              {job.location}
              {job.neighborhood ? `, ${job.neighborhood}` : ''}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Calendar size={18} color={themeColors.text.secondary} />
            <Text style={[styles.infoText, { color: themeColors.text.primary }]}>
              {formatDate(job.startDate)}
              {job.endDate && !job.endDateFlexible ? ` - ${formatDate(job.endDate)}` : ''}
              {job.endDateFlexible ? ' (fecha flexible)' : ''}
            </Text>
          </View>

          {job.maxWorkers && job.maxWorkers > 1 && (
            <View style={styles.infoRow}>
              <Users size={18} color={themeColors.text.secondary} />
              <Text style={[styles.infoText, { color: themeColors.text.primary }]}>
                {job.maxWorkers} trabajadores máximo
              </Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Clock size={18} color={themeColors.text.secondary} />
            <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
              Publicado {formatDate(job.createdAt)}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
            Descripción
          </Text>
          <Text style={[styles.description, { color: themeColors.text.secondary }]}>
            {job.description}
          </Text>
        </View>

        {/* Client Info */}
        {client && (
          <TouchableOpacity
            style={[styles.clientCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => router.push(`/user/${client._id || client.id}`)}
          >
            <View style={styles.clientAvatar}>
              <User size={24} color={themeColors.text.secondary} />
            </View>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientName, { color: themeColors.text.primary }]}>
                {client.name}
              </Text>
              <View style={styles.clientRating}>
                <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} />
                <Text style={[styles.clientRatingText, { color: themeColors.text.secondary }]}>
                  {client.rating?.toFixed(1) || 'Nuevo'} ({client.reviewsCount || 0} reseñas)
                </Text>
              </View>
            </View>
            <ArrowLeft size={20} color={themeColors.text.muted} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        )}

        {/* Proposals Section - Only for owner */}
        {isOwner && proposals.length > 0 && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              Propuestas ({proposals.length})
            </Text>
            {proposals.map((proposal) => {
              const doer = proposal.doer as UserSummary;
              return (
                <View
                  key={proposal._id}
                  style={[styles.proposalItem, { borderColor: themeColors.border }]}
                >
                  <View style={styles.proposalHeader}>
                    <Text style={[styles.proposalDoer, { color: themeColors.text.primary }]}>
                      {doer?.name || 'Usuario'}
                    </Text>
                    {proposal.proposedPrice && (
                      <Text style={[styles.proposalPrice, { color: themeColors.primary[600] }]}>
                        {formatPrice(proposal.proposedPrice)}
                      </Text>
                    )}
                  </View>
                  {proposal.message && (
                    <Text style={[styles.proposalMessage, { color: themeColors.text.secondary }]}>
                      {proposal.message}
                    </Text>
                  )}
                  <Text style={[styles.proposalDate, { color: themeColors.text.muted }]}>
                    {formatDate(proposal.createdAt)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Apply Section */}
        {!isOwner && job.status === 'open' && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {hasApplied ? (
              <View style={styles.appliedContainer}>
                <CheckCircle size={24} color={colors.success[500]} />
                <Text style={[styles.appliedText, { color: colors.success[600] }]}>
                  Ya aplicaste a este trabajo
                </Text>
              </View>
            ) : showProposalForm ? (
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
                  Enviar propuesta
                </Text>

                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>
                  Mensaje *
                </Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: themeColors.slate[50],
                      borderColor: themeColors.border,
                      color: themeColors.text.primary,
                    },
                  ]}
                  placeholder="¿Por qué eres el candidato ideal para este trabajo?"
                  placeholderTextColor={themeColors.text.muted}
                  value={proposalMessage}
                  onChangeText={setProposalMessage}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>
                  Precio propuesto (opcional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: themeColors.slate[50],
                      borderColor: themeColors.border,
                      color: themeColors.text.primary,
                    },
                  ]}
                  placeholder={`Precio original: ${formatPrice(job.price || job.budget)}`}
                  placeholderTextColor={themeColors.text.muted}
                  value={proposedPrice}
                  onChangeText={setProposedPrice}
                  keyboardType="numeric"
                />

                <View style={styles.proposalActions}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { borderColor: themeColors.border }]}
                    onPress={() => setShowProposalForm(false)}
                  >
                    <Text style={[styles.cancelButtonText, { color: themeColors.text.secondary }]}>
                      Cancelar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.buttonDisabled]}
                    onPress={handleApply}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Send size={18} color="#fff" />
                        <Text style={styles.submitButtonText}>Enviar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => {
                  if (!isAuthenticated) {
                    router.push('/(auth)/login');
                  } else {
                    setShowProposalForm(true);
                  }
                }}
              >
                <Send size={20} color="#fff" />
                <Text style={styles.applyButtonText}>Aplicar a este trabajo</Text>
              </TouchableOpacity>
            )}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  price: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  categoryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  infoCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.base,
    flex: 1,
  },
  section: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  description: {
    fontSize: fontSize.base,
    lineHeight: 24,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.slate[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  clientRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  clientRatingText: {
    fontSize: fontSize.sm,
  },
  proposalItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  proposalDoer: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  proposalPrice: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  proposalMessage: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  proposalDate: {
    fontSize: fontSize.xs,
  },
  appliedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  appliedText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  textArea: {
    minHeight: 100,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  proposalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  submitButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  applyButton: {
    height: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
