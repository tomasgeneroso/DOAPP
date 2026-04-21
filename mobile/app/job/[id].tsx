import { useState, useEffect, useRef } from 'react';
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
  Modal,
  Animated,
  Linking,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  Clock,
  Star,
  Send,
  AlertCircle,
  CheckCircle,
  Users,
  Key,
  Copy,
  Check,
  XCircle,
  Play,
  Pause,
  Shield,
  Info,
  X,
  ChevronRight,
  Navigation,
  RefreshCw,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getJob, pauseJob, resumeJob, cancelJob } from '../../services/jobs';
import { createProposal, getProposalsByJob } from '../../services/proposals';
import { getContractsByJob, confirmContract } from '../../services/contracts';
import { Job, Proposal, UserSummary, Contract } from '../../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { getCategoryById } from '../../services/jobs';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDarkMode, colors: themeColors } = useTheme();
  const { user, isAuthenticated } = useAuth();

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const [job, setJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proposalMessage, setProposalMessage] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [copiedJobCode, setCopiedJobCode] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const runEntranceAnimation = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  };

  const getJobCode = (jobId: string | undefined): string => {
    if (!jobId) return 'A0000';
    const hex = jobId.replace(/-/g, '');
    const letter = String.fromCharCode(65 + (parseInt(hex[0], 16) % 26));
    const nums = hex.slice(1, 5).split('').map(c => String(parseInt(c, 16) % 10)).join('');
    return letter + nums;
  };

  const handleCopyJobCode = async () => {
    if (job?.id || job?._id) {
      const code = getJobCode(job.id || job._id);
      await Clipboard.setStringAsync(code);
      setCopiedJobCode(true);
      setTimeout(() => setCopiedJobCode(false), 3000);
    }
  };

  const fetchJob = async () => {
    if (!id) return;
    try {
      const response = await getJob(id);
      if (response.success) {
        setJob((response as any).job || response.data?.job);
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
        const userProposal = response.data.proposals.find((p) => {
          const doer = p.doer as UserSummary;
          return doer?._id === user?._id || doer?.id === user?._id;
        });
        setHasApplied(!!userProposal);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    }
  };

  const fetchContracts = async () => {
    if (!id || !isAuthenticated) return;
    try {
      const response = await getContractsByJob(id);
      if (response.success && response.data) {
        setContracts(response.data.contracts || []);
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchJob(), fetchProposals(), fetchContracts()]);
    setLoading(false);
    runEntranceAnimation();
  };

  const handleOpenMap = (location: string) => {
    const query = encodeURIComponent(location);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`geo:0,0?q=${query}`);
    });
  };

  const handleReprogramar = () => {
    Alert.alert(
      'Reprogramar trabajo',
      '¿Qué querés cambiar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Editar trabajo',
          onPress: () => router.push(`/job/edit/${id}`),
        },
      ]
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchJob(), fetchProposals(), fetchContracts()]);
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

  const handlePause = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      const response = await pauseJob(job.id || job._id);
      if (response.success) {
        setJob((prev) => prev ? { ...prev, status: 'paused' } : prev);
        Alert.alert('Trabajo pausado', 'El trabajo fue pausado correctamente.');
      } else {
        Alert.alert('Error', (response as any).message || 'No se pudo pausar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      const response = await resumeJob(job.id || job._id);
      if (response.success) {
        setJob((prev) => prev ? { ...prev, status: 'open' } : prev);
        Alert.alert('Trabajo reanudado', 'El trabajo fue reanudado correctamente.');
      } else {
        Alert.alert('Error', (response as any).message || 'No se pudo reanudar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      const response = await cancelJob(job.id || job._id, cancelReason);
      if (response.success) {
        setJob((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
        setShowCancelModal(false);
        Alert.alert('Trabajo cancelado', 'El trabajo fue cancelado.');
      } else {
        Alert.alert('Error', (response as any).message || 'No se pudo cancelar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmContract = async (contractId: string) => {
    setActionLoading(true);
    try {
      const response = await confirmContract(contractId);
      if (response.success) {
        Alert.alert('Confirmado', 'Confirmaste la finalización del trabajo.');
        fetchContracts();
      } else {
        Alert.alert('Error', (response as any).message || 'No se pudo confirmar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setActionLoading(false);
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

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return colors.success[500];
      case 'in_progress': return colors.primary[500];
      case 'completed': return colors.slate[500];
      case 'cancelled':
      case 'paused': return colors.danger[500];
      default: return colors.warning[500];
    }
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
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
    return map[status] || status;
  };

  const getContractStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: 'Pendiente',
      ready: 'Listo',
      accepted: 'Aceptado',
      in_progress: 'En progreso',
      awaiting_confirmation: 'Esperando confirmación',
      completed: 'Completado',
      cancelled: 'Cancelado',
      disputed: 'En disputa',
    };
    return map[status] || status;
  };

  const isOwner = !!(user && job && (
    (job.client as UserSummary)?._id === user._id ||
    (job.client as UserSummary)?.id === user._id ||
    job.postedBy === user._id
  ));

  const myContract = contracts.find((c) => {
    const contractDoer = c.doer as any;
    const contractClient = c.client as any;
    return (
      contractDoer?._id === user?._id || contractDoer?.id === user?._id ||
      contractClient?._id === user?._id || contractClient?.id === user?._id
    );
  });

  const isWorkerSelected = !!(job && user && (
    job.selectedWorkers?.includes(user._id) ||
    (job.doer as UserSummary)?._id === user._id ||
    (job.doer as UserSummary)?.id === user._id
  ));

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
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color={colors.danger[500]} />
          <Text style={[styles.errorText, { color: themeColors.text.primary }]}>Trabajo no encontrado</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleGoBack}>
            <Text style={styles.retryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const client = job.client as UserSummary;
  const doer = job.doer as UserSummary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {job.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Status Badge & Job Code */}
        <View style={styles.badgesRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(job.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(job.status) }]}>
              {getStatusText(job.status)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCopyJobCode}
            style={[styles.jobCodeBadge, { backgroundColor: themeColors.primary[50], borderColor: themeColors.primary[200] }]}
          >
            <Key size={14} color={themeColors.primary[600]} />
            <Text style={[styles.jobCodeText, { color: themeColors.primary[700] }]}>
              #{getJobCode(job.id || job._id)}
            </Text>
            {copiedJobCode
              ? <Check size={14} color={colors.success[500]} />
              : <Copy size={14} color={themeColors.primary[400]} />}
          </TouchableOpacity>
        </View>

        {/* Title, Price & Category */}
        <Text style={[styles.title, { color: themeColors.text.primary }]}>{job.title}</Text>
        <Text style={[styles.price, { color: themeColors.primary[600] }]}>
          {formatPrice(job.price || job.budget)}
        </Text>
        <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary[50] }]}>
          <Text style={[styles.categoryText, { color: themeColors.primary[600] }]}>
            {(() => { const cat = getCategoryById(job.category); return cat ? `${cat.icon} ${cat.label}` : job.category; })()}
          </Text>
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          {/* Location with map button */}
          <View style={styles.infoRow}>
            <MapPin size={18} color={themeColors.text.secondary} />
            <Text style={[styles.infoText, { color: themeColors.text.primary }]}>
              {job.location}{job.neighborhood ? `, ${job.neighborhood}` : ''}{job.postalCode ? `, CP ${job.postalCode}` : ''}
            </Text>
            <Pressable
              onPress={() => handleOpenMap(`${job.location}${job.neighborhood ? `, ${job.neighborhood}` : ''}`)}
              style={({ pressed }) => [styles.mapBtn, { backgroundColor: themeColors.primary[50], opacity: pressed ? 0.7 : 1 }]}
            >
              <Navigation size={14} color={themeColors.primary[600]} />
              <Text style={[styles.mapBtnText, { color: themeColors.primary[600] }]}>Ver</Text>
            </Pressable>
          </View>

          {/* Start date + time */}
          <View style={styles.infoRow}>
            <Calendar size={18} color={themeColors.text.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Inicio</Text>
              <Text style={[styles.infoText, { color: themeColors.text.primary }]}>
                {formatDate(job.startDate)} · {formatTime(job.startDate)}
              </Text>
            </View>
          </View>

          {/* End date + time */}
          {job.endDateFlexible ? (
            <View style={styles.infoRow}>
              <Calendar size={18} color={colors.warning[500]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Fin</Text>
                <Text style={[styles.infoText, { color: colors.warning[600] }]}>Fecha flexible</Text>
              </View>
            </View>
          ) : job.endDate ? (
            <View style={styles.infoRow}>
              <Calendar size={18} color={themeColors.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Fin</Text>
                <Text style={[styles.infoText, { color: themeColors.text.primary }]}>
                  {formatDate(job.endDate)} · {formatTime(job.endDate)}
                </Text>
              </View>
            </View>
          ) : null}

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

        {/* Cancellation Reason */}
        {job.status === 'cancelled' && job.cancellationReason && (
          <View style={[styles.alertCard, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}>
            <XCircle size={18} color={colors.danger[600]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, { color: colors.danger[700] }]}>Motivo de cancelación</Text>
              <Text style={[styles.alertText, { color: colors.danger[600] }]}>{job.cancellationReason}</Text>
            </View>
          </View>
        )}

        {/* Información del Trabajo (owner only) */}
        {isOwner && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Información del Trabajo</Text>

            <View style={[styles.infoGrid, { borderBottomColor: themeColors.border }]}>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: themeColors.text.secondary }]}>Cliente</Text>
                <TouchableOpacity onPress={() => client && router.push(`/user/${client._id || client.id}`)}>
                  <Text style={[styles.infoGridValue, { color: themeColors.primary[600] }]}>
                    {client?.name || 'N/A'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: themeColors.text.secondary }]}>Trabajador</Text>
                {doer ? (
                  <TouchableOpacity onPress={() => router.push(`/user/${doer._id || doer.id}`)}>
                    <Text style={[styles.infoGridValue, { color: themeColors.primary[600] }]}>{doer.name}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.infoGridValue, { color: themeColors.text.muted }]}>Pendiente de asignar</Text>
                )}
              </View>
            </View>

            <View style={styles.infoGrid}>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: themeColors.text.secondary }]}>Precio</Text>
                <Text style={[styles.infoGridValue, { color: themeColors.text.primary }]}>
                  {formatPrice(job.price || job.budget)}
                </Text>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: themeColors.text.secondary }]}>Estado</Text>
                <View style={[styles.miniStatusBadge, { backgroundColor: getStatusColor(job.status) + '20' }]}>
                  <Text style={[styles.miniStatusText, { color: getStatusColor(job.status) }]}>
                    {getStatusText(job.status)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.escrowBadge, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
              <Shield size={14} color={colors.success[600]} />
              <Text style={[styles.escrowText, { color: colors.success[700] }]}>Pago protegido con escrow</Text>
            </View>
          </View>
        )}

        {/* Contracts List (owner) */}
        {isOwner && contracts.length > 0 && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              {contracts.length === 1 ? 'Contrato activo' : `Contratos (${contracts.length})`}
            </Text>
            {contracts.map((contract) => {
              const cDoer = contract.doer as any;
              return (
                <TouchableOpacity
                  key={contract._id || contract.id}
                  style={[styles.contractItem, { borderColor: themeColors.border }]}
                  onPress={() => router.push(`/contracts/${contract._id || contract.id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contractWorker, { color: themeColors.text.primary }]}>
                      {cDoer?.name || 'Trabajador'}
                    </Text>
                    <View style={[styles.miniStatusBadge, { backgroundColor: getStatusColor(contract.status) + '20', marginTop: 4 }]}>
                      <Text style={[styles.miniStatusText, { color: getStatusColor(contract.status) }]}>
                        {getContractStatusText(contract.status)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.contractPrice, { color: themeColors.primary[600] }]}>
                      {formatPrice(contract.price)}
                    </Text>
                    <ChevronRight size={16} color={themeColors.text.muted} style={{ marginTop: 4 }} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* No contract yet info */}
        {isOwner && contracts.length === 0 &&
          job.status !== 'open' && job.status !== 'draft' &&
          job.status !== 'cancelled' && job.status !== 'pending_payment' &&
          job.status !== 'pending_approval' && (
          <View style={[styles.infoBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Info size={18} color={themeColors.text.secondary} />
            <Text style={[styles.infoBoxText, { color: themeColors.text.secondary }]}>
              Aún no hay contrato activo para este trabajo
            </Text>
          </View>
        )}

        {/* Pending approval banner */}
        {isOwner && job.status === 'pending_approval' && (
          <View style={[styles.alertCard, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
            <Info size={18} color={colors.primary[600]} />
            <Text style={[styles.alertText, { color: colors.primary[700] }]}>
              Tu trabajo está siendo revisado por el equipo de DoApp.
            </Text>
          </View>
        )}

        {/* Draft banner */}
        {isOwner && job.status === 'draft' && (
          <View style={[styles.alertCard, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
            <AlertCircle size={18} color={colors.warning[600]} />
            <Text style={[styles.alertText, { color: colors.warning[700] }]}>
              Este trabajo es un borrador. Pagá la publicación para que esté visible.
            </Text>
          </View>
        )}

        {/* Description */}
        <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Descripción</Text>
          <Text style={[styles.description, { color: themeColors.text.secondary }]}>{job.description}</Text>
        </View>

        {/* Worker Status Card (non-owner, selected) */}
        {!isOwner && isWorkerSelected && job.status !== 'cancelled' && job.status !== 'completed' && (
          <View style={[styles.workerStatusCard, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
            <CheckCircle size={20} color={colors.primary[600]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.workerStatusTitle, { color: colors.primary[700] }]}>
                {job.status === 'in_progress' ? '¡Trabajo en curso!' : '¡Fuiste seleccionado para este trabajo!'}
              </Text>
              <Text style={[styles.workerStatusText, { color: colors.primary[600] }]}>
                {job.status === 'in_progress'
                  ? `Fecha de fin: ${formatDate(job.endDate || job.startDate)}`
                  : `Fecha de inicio: ${formatDate(job.startDate)}`}
              </Text>
            </View>
          </View>
        )}

        {/* Awaiting Confirmation */}
        {myContract && myContract.status === 'awaiting_confirmation' && (
          <View style={[styles.section, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
            <Text style={[styles.sectionTitle, { color: colors.success[700] }]}>¡Trabajo finalizado!</Text>
            <Text style={[styles.description, { color: colors.success[600] }]}>
              Ambas partes deben confirmar para liberar el pago.
            </Text>
            <View style={styles.confirmRow}>
              <View style={styles.confirmStatus}>
                <CheckCircle size={18} color={myContract.clientConfirmed ? colors.success[500] : colors.slate[300]} />
                <Text style={[styles.confirmLabel, { color: themeColors.text.secondary }]}>
                  Cliente: {myContract.clientConfirmed ? 'Confirmado' : 'Pendiente'}
                </Text>
              </View>
              <View style={styles.confirmStatus}>
                <CheckCircle size={18} color={myContract.doerConfirmed ? colors.success[500] : colors.slate[300]} />
                <Text style={[styles.confirmLabel, { color: themeColors.text.secondary }]}>
                  Trabajador: {myContract.doerConfirmed ? 'Confirmado' : 'Pendiente'}
                </Text>
              </View>
            </View>
            {((isOwner && !myContract.clientConfirmed) || (!isOwner && !myContract.doerConfirmed)) && (
              <TouchableOpacity
                style={[styles.confirmButton, actionLoading && styles.buttonDisabled]}
                onPress={() => handleConfirmContract(myContract._id || myContract.id || '')}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <CheckCircle size={18} color="#fff" />
                    <Text style={styles.confirmButtonText}>Confirmar finalización</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Proposals Section (owner) */}
        {isOwner && proposals.length > 0 && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              Postulantes ({proposals.length})
            </Text>
            {proposals.map((proposal) => {
              const proposalDoer = proposal.doer as UserSummary;
              return (
                <View key={proposal._id} style={[styles.proposalItem, { borderColor: themeColors.border }]}>
                  <View style={styles.proposalHeader}>
                    <View style={styles.proposalDoerRow}>
                      <Text style={[styles.proposalDoer, { color: themeColors.text.primary }]}>
                        {proposalDoer?.name || 'Usuario'}
                      </Text>
                      <View style={[styles.proposalJobCode, { backgroundColor: themeColors.primary[50] }]}>
                        <Key size={10} color={themeColors.primary[600]} />
                        <Text style={[styles.proposalJobCodeText, { color: themeColors.primary[700] }]}>
                          #{getJobCode(job.id || job._id)}
                        </Text>
                      </View>
                    </View>
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

        {/* No Proposals Empty State (owner, open job) */}
        {isOwner && proposals.length === 0 && job.status === 'open' && (
          <View style={[styles.alertCard, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
            <AlertCircle size={18} color={colors.warning[600]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, { color: colors.warning[700] }]}>
                Ningún trabajador se postuló aún
              </Text>
              <Text style={[styles.alertText, { color: colors.warning[600] }]}>
                Considerá actualizar las fechas, ajustar el presupuesto o agregar más detalles.
              </Text>
            </View>
          </View>
        )}

        {/* Reprogramar - owner, cancelled or expired */}
        {isOwner && (job.status === 'cancelled' || job.status === 'paused') && (
          <Pressable
            onPress={handleReprogramar}
            style={({ pressed }) => [
              styles.reprogramarBtn,
              { backgroundColor: themeColors.primary[600], opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <RefreshCw size={18} color="#fff" />
            <Text style={styles.reprogramarText}>Reprogramar trabajo</Text>
          </Pressable>
        )}

        {/* Apply Section (non-owner, open jobs) */}
        {!isOwner && job.status === 'open' && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {hasApplied ? (
              <View style={styles.appliedContainer}>
                <CheckCircle size={24} color={colors.success[500]} />
                <Text style={[styles.appliedText, { color: colors.success[600] }]}>Ya aplicaste a este trabajo</Text>
              </View>
            ) : showProposalForm ? (
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Enviar propuesta</Text>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Mensaje *</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="¿Por qué eres el candidato ideal para este trabajo?"
                  placeholderTextColor={themeColors.text.muted}
                  value={proposalMessage}
                  onChangeText={setProposalMessage}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Precio propuesto (opcional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
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
                    <Text style={[styles.cancelButtonText, { color: themeColors.text.secondary }]}>Cancelar</Text>
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

        {/* Client Info Card */}
        {client && (
          <TouchableOpacity
            style={[styles.clientCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => router.push(`/user/${client._id || client.id}`)}
          >
            <View style={styles.clientAvatar}>
              <User size={24} color={themeColors.text.secondary} />
            </View>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientName, { color: themeColors.text.primary }]}>{client.name}</Text>
              <View style={styles.clientRating}>
                <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} />
                <Text style={[styles.clientRatingText, { color: themeColors.text.secondary }]}>
                  {client.rating ? Number(client.rating).toFixed(1) : 'Nuevo'} ({client.reviewsCount || 0} reseñas)
                </Text>
              </View>
              {client.completedJobs !== undefined && (
                <Text style={[styles.clientMeta, { color: themeColors.text.muted }]}>
                  {client.completedJobs} trabajos completados
                </Text>
              )}
            </View>
            <ArrowLeft size={20} color={themeColors.text.muted} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        )}

        {/* Owner Action Buttons */}
        {isOwner && (job.status === 'open' || job.status === 'paused') && (
          <View style={styles.actionRow}>
            {job.status === 'open' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.warning[100], borderColor: colors.warning[300] }]}
                onPress={handlePause}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.warning[600]} />
                ) : (
                  <>
                    <Pause size={18} color={colors.warning[700]} />
                    <Text style={[styles.actionButtonText, { color: colors.warning[700] }]}>Pausar</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {job.status === 'paused' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.success[100], borderColor: colors.success[300] }]}
                onPress={handleResume}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.success[600]} />
                ) : (
                  <>
                    <Play size={18} color={colors.success[700]} />
                    <Text style={[styles.actionButtonText, { color: colors.success[700] }]}>Reanudar</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.danger[100], borderColor: colors.danger[300] }]}
              onPress={() => setShowCancelModal(true)}
              disabled={actionLoading}
            >
              <XCircle size={18} color={colors.danger[700]} />
              <Text style={[styles.actionButtonText, { color: colors.danger[700] }]}>Cancelar trabajo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tip Card */}
        <View style={[styles.tipCard, { backgroundColor: colors.primary[50], borderColor: colors.primary[100] }]}>
          <Info size={16} color={colors.primary[500]} />
          <Text style={[styles.tipText, { color: colors.primary[700] }]}>
            Leé bien la descripción y asegurate de tener las herramientas necesarias antes de aplicar.
          </Text>
        </View>
      </Animated.View>
      </ScrollView>

      {/* Cancel Modal */}
      <Modal visible={showCancelModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Cancelar trabajo</Text>
              <TouchableOpacity onPress={() => setShowCancelModal(false)}>
                <X size={24} color={themeColors.text.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalDesc, { color: themeColors.text.secondary }]}>
              ¿Estás seguro? Esta acción no se puede deshacer.
            </Text>
            <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Motivo (opcional)</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
              placeholder="Ej: Cambié de opinión, surgió un imprevisto..."
              placeholderTextColor={themeColors.text.muted}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.proposalActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: themeColors.border, flex: 1 }]}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: themeColors.text.secondary }]}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { flex: 1, backgroundColor: colors.danger[600] }, actionLoading && styles.buttonDisabled]}
                onPress={handleCancel}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Confirmar cancelación</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  errorText: { fontSize: fontSize.lg, fontWeight: fontWeight.medium, marginTop: spacing.lg, marginBottom: spacing.xl },
  retryButton: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  badgesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  jobCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  jobCodeText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, fontFamily: 'monospace' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.xs },
  statusText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  price: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.md },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.md, marginBottom: spacing.lg },
  categoryText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  infoCard: { padding: spacing.lg, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg, gap: spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { fontSize: fontSize.base, flex: 1 },
  section: { padding: spacing.lg, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md },
  description: { fontSize: fontSize.base, lineHeight: 24 },

  // Alert / info cards
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg },
  alertTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: 2 },
  alertText: { fontSize: fontSize.sm, lineHeight: 20, flex: 1 },

  // Info Work section grid
  infoGrid: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, marginBottom: spacing.md },
  infoGridItem: { flex: 1 },
  infoGridLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.xs, textTransform: 'uppercase' },
  infoGridValue: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  miniStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  miniStatusText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  escrowBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.md, borderWidth: 1, alignSelf: 'flex-start', marginTop: spacing.xs },
  escrowText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  // Contracts
  contractItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderTopWidth: 1 },
  contractWorker: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  contractPrice: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },

  // Info box
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg },
  infoBoxText: { fontSize: fontSize.sm, flex: 1 },

  // Worker status
  workerStatusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg },
  workerStatusTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: 2 },
  workerStatusText: { fontSize: fontSize.sm },

  // Confirmation
  confirmRow: { flexDirection: 'row', gap: spacing.xl, marginVertical: spacing.md },
  confirmStatus: { flexDirection: 'row', alignItems: 'center' },
  confirmLabel: { fontSize: fontSize.sm, marginLeft: spacing.xs },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success[600],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  confirmButtonText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },

  // Client card
  clientCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg },
  clientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  clientInfo: { flex: 1 },
  clientName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  clientRating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clientRatingText: { fontSize: fontSize.sm },
  clientMeta: { fontSize: fontSize.xs, marginTop: 2 },

  // Proposals
  proposalItem: { paddingVertical: spacing.md, borderBottomWidth: 1 },
  proposalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  proposalDoerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  proposalDoer: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  proposalJobCode: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: borderRadius.sm, gap: 2 },
  proposalJobCodeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, fontFamily: 'monospace' },
  proposalPrice: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  proposalMessage: { fontSize: fontSize.sm, marginBottom: spacing.xs },
  proposalDate: { fontSize: fontSize.xs },

  // Apply form
  appliedContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  appliedText: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  inputLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { height: 48, borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: fontSize.base },
  textArea: { minHeight: 100, borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.base },
  proposalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  cancelButton: { flex: 1, height: 48, borderRadius: borderRadius.lg, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  cancelButtonText: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  submitButton: { flex: 1, height: 48, borderRadius: borderRadius.lg, backgroundColor: colors.primary[600], flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  submitButtonText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  buttonDisabled: { opacity: 0.7 },
  applyButton: { height: 52, borderRadius: borderRadius.lg, backgroundColor: colors.primary[600], flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  applyButtonText: { color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.semibold },

  // Owner actions
  actionRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1 },
  actionButtonText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },

  // Tip card
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.lg },
  tipText: { fontSize: fontSize.sm, flex: 1, lineHeight: 20 },

  // Map button
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.md },
  mapBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  infoLabel: { fontSize: fontSize.xs, marginBottom: 1 },

  // Reprogramar
  reprogramarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
  },
  reprogramarText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },

  // Cancel modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { width: '100%', borderRadius: borderRadius.xl, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  modalDesc: { fontSize: fontSize.base, marginBottom: spacing.md },
});
