import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  CheckCircle,
  AlertTriangle,
  MessageCircle,
  Clock,
  Shield,
  XCircle,
  MapPin,
  Navigation,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getContract, confirmContract, rejectConfirmation } from '../../services/contracts';
import { Contract, Job, User as UserType } from '../../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function ContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Confirmation hours form
  const [showHoursForm, setShowHoursForm] = useState(false);
  const [proposedStartDate, setProposedStartDate] = useState('');
  const [proposedStartTime, setProposedStartTime] = useState('');
  const [proposedEndDate, setProposedEndDate] = useState('');
  const [proposedEndTime, setProposedEndTime] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');
  // Rejection
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchContract = async () => {
    if (!id) return;

    try {
      const response = await getContract(id);
      if (response.success && response.data) {
        setContract(response.data.contract);
      }
    } catch (error) {
      console.error('Error fetching contract:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchContract();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchContract();
  }, [id]);

  const handleOpenHoursForm = () => {
    if (contract) {
      const start = new Date(contract.startDate);
      const end = new Date(contract.endDate);
      setProposedStartDate(start.toISOString().split('T')[0]);
      setProposedStartTime(start.toTimeString().slice(0, 5));
      setProposedEndDate(end.toISOString().split('T')[0]);
      setProposedEndTime(end.toTimeString().slice(0, 5));
      setConfirmNotes('');
      setShowHoursForm(true);
    }
  };

  const handleProposeHours = async () => {
    if (!proposedStartDate || !proposedStartTime || !proposedEndDate || !proposedEndTime) {
      Alert.alert('Error', 'Debes indicar fecha y hora de inicio y fin');
      return;
    }
    const startISO = `${proposedStartDate}T${proposedStartTime}:00`;
    const endISO = `${proposedEndDate}T${proposedEndTime}:00`;
    if (new Date(endISO) <= new Date(startISO)) {
      Alert.alert('Error', 'La hora de fin debe ser posterior a la de inicio');
      return;
    }

    setConfirming(true);
    try {
      const response = await confirmContract(id!, {
        proposedStartTime: startISO,
        proposedEndTime: endISO,
        notes: confirmNotes || undefined,
      });
      if (response.success) {
        setShowHoursForm(false);
        Alert.alert('Confirmado', 'Tus horas han sido registradas. Esperando revisión.');
        fetchContract();
      } else {
        Alert.alert('Error', response.message || 'No se pudo confirmar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmOtherParty = () => {
    Alert.alert(
      'Confirmar trabajo',
      '¿Confirmas que las horas reportadas son correctas y el trabajo fue completado?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setConfirming(true);
            try {
              const response = await confirmContract(id!);
              if (response.success) {
                Alert.alert('Completado', 'Contrato completado. El pago ha sido liberado.');
                fetchContract();
              } else {
                Alert.alert('Error', response.message || 'No se pudo confirmar');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Error de conexión');
            } finally {
              setConfirming(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Error', 'Debes proporcionar un motivo');
      return;
    }
    setConfirming(true);
    try {
      const response = await rejectConfirmation(id!, { reason: rejectionReason.trim() });
      if (response.success) {
        setShowRejectForm(false);
        Alert.alert('Rechazado', 'Se ha creado una disputa automáticamente.');
        fetchContract();
      } else {
        Alert.alert('Error', response.message || 'No se pudo rechazar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setConfirming(false);
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
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success[500];
      case 'in_progress':
      case 'accepted':
        return colors.primary[500];
      case 'pending':
      case 'ready':
      case 'awaiting_confirmation':
        return colors.warning[500];
      case 'cancelled':
      case 'disputed':
        return colors.danger[500];
      default:
        return colors.slate[500];
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'Pendiente de aprobación',
      ready: 'Listo para comenzar',
      accepted: 'Aceptado',
      in_progress: 'En progreso',
      awaiting_confirmation: 'Esperando confirmación',
      completed: 'Completado',
      cancelled: 'Cancelado',
      disputed: 'En disputa',
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/contracts')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Contrato
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!contract) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/contracts')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Contrato
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <AlertTriangle size={48} color={colors.danger[500]} />
          <Text style={[styles.errorText, { color: themeColors.text.primary }]}>
            Contrato no encontrado
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const job = contract.job as Job;
  const client = contract.client as UserType;
  const doer = contract.doer as UserType;
  const userId = user?._id || user?.id;
  const isClient = client?._id === userId || client?.id === userId;
  const isDoer = doer?._id === userId || doer?.id === userId;
  // Can this party propose hours? (first to confirm)
  const canProposeHours = contract.status === 'in_progress' && !contract.clientConfirmed && !contract.doerConfirmed;
  // Can this party review the other's proposal?
  const canReview = contract.status === 'awaiting_confirmation' && contract.confirmationProposedBy !== userId && (isClient || isDoer);
  // Is doer past 30% threshold?
  const doerCanConfirmYet = (() => {
    if (!isDoer || !contract.startDate || !contract.endDate) return true;
    const totalDuration = new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime();
    const elapsed = Date.now() - new Date(contract.startDate).getTime();
    return elapsed >= totalDuration * 0.3;
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/contracts')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Contrato
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
        {/* Status */}
        <View style={[styles.statusCard, { backgroundColor: getStatusColor(contract.status) + '15' }]}>
          <View style={[styles.statusIconContainer, { backgroundColor: getStatusColor(contract.status) }]}>
            {contract.status === 'completed' ? (
              <CheckCircle size={24} color="#fff" />
            ) : contract.status === 'disputed' ? (
              <AlertTriangle size={24} color="#fff" />
            ) : (
              <Clock size={24} color="#fff" />
            )}
          </View>
          <Text style={[styles.statusTitle, { color: getStatusColor(contract.status) }]}>
            {getStatusText(contract.status)}
          </Text>
        </View>

        {/* Job Info */}
        <TouchableOpacity
          style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => router.push(`/job/${job?._id || job?.id}`)}
        >
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
            Trabajo
          </Text>
          <Text style={[styles.jobTitle, { color: themeColors.text.primary }]}>
            {job?.title || 'Trabajo'}
          </Text>
          <Text style={[styles.jobCategory, { color: themeColors.text.secondary }]}>
            {job?.category}
          </Text>
        </TouchableOpacity>

        {/* Contract Details */}
        <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
            Detalles
          </Text>

          <View style={styles.detailRow}>
            <DollarSign size={18} color={themeColors.text.secondary} />
            <View style={styles.detailContent}>
              <Text style={[styles.detailLabel, { color: themeColors.text.muted }]}>
                Monto
              </Text>
              <Text style={[styles.detailValue, { color: themeColors.text.primary }]}>
                {formatPrice(contract.price)}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Calendar size={18} color={themeColors.text.secondary} />
            <View style={styles.detailContent}>
              <Text style={[styles.detailLabel, { color: themeColors.text.muted }]}>
                Fechas
              </Text>
              <Text style={[styles.detailValue, { color: themeColors.text.primary }]}>
                {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Shield size={18} color={themeColors.text.secondary} />
            <View style={styles.detailContent}>
              <Text style={[styles.detailLabel, { color: themeColors.text.muted }]}>
                Estado del pago
              </Text>
              <Text style={[styles.detailValue, { color: themeColors.text.primary }]}>
                {contract.paymentStatus === 'held_escrow'
                  ? 'Retenido en escrow'
                  : contract.paymentStatus === 'released'
                  ? 'Liberado'
                  : contract.paymentStatus}
              </Text>
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
            Partes
          </Text>

          <TouchableOpacity
            style={styles.partyRow}
            onPress={() => router.push(`/user/${client?._id || client?.id}`)}
          >
            <View style={[styles.partyAvatar, { backgroundColor: themeColors.slate[100] }]}>
              <User size={20} color={themeColors.text.secondary} />
            </View>
            <View style={styles.partyInfo}>
              <Text style={[styles.partyRole, { color: themeColors.text.muted }]}>
                Cliente
              </Text>
              <Text style={[styles.partyName, { color: themeColors.text.primary }]}>
                {client?.name || 'Usuario'}
                {isClient && ' (Tú)'}
              </Text>
            </View>
            {contract.clientConfirmed && (
              <CheckCircle size={20} color={colors.success[500]} />
            )}
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <TouchableOpacity
            style={styles.partyRow}
            onPress={() => router.push(`/user/${doer?._id || doer?.id}`)}
          >
            <View style={[styles.partyAvatar, { backgroundColor: themeColors.slate[100] }]}>
              <User size={20} color={themeColors.text.secondary} />
            </View>
            <View style={styles.partyInfo}>
              <Text style={[styles.partyRole, { color: themeColors.text.muted }]}>
                Trabajador
              </Text>
              <Text style={[styles.partyName, { color: themeColors.text.primary }]}>
                {doer?.name || 'Usuario'}
                {isDoer && ' (Tú)'}
              </Text>
            </View>
            {contract.doerConfirmed && (
              <CheckCircle size={20} color={colors.success[500]} />
            )}
          </TouchableOpacity>
        </View>

        {/* Ubicación del trabajo */}
        {(job?.location || job?.neighborhood || (job as any)?.address) && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              Ubicación
            </Text>
            <View style={styles.locationCard}>
              <View style={[styles.locationIconWrap, { backgroundColor: themeColors.primary[50] }]}>
                <MapPin size={22} color={themeColors.primary[600]} strokeWidth={2} />
              </View>
              <View style={styles.locationInfo}>
                <Text style={[styles.locationMain, { color: themeColors.text.primary }]}>
                  {job?.neighborhood ? `${job.neighborhood}, ` : ''}{job?.location}
                </Text>
                {(job as any)?.postalCode ? (
                  <Text style={[styles.locationSub, { color: themeColors.text.muted }]}>
                    CP {(job as any).postalCode}
                  </Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.openMapBtn, { backgroundColor: themeColors.primary[600] }]}
              onPress={() => {
                const query = encodeURIComponent(
                  [job?.neighborhood, job?.location].filter(Boolean).join(', ')
                );
                const url = Platform.OS === 'ios'
                  ? `maps://maps.apple.com/?q=${query}`
                  : `https://www.google.com/maps/search/?api=1&query=${query}`;
                Linking.openURL(url).catch(() =>
                  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`)
                );
              }}
            >
              <Navigation size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.openMapBtnText}>Abrir en mapa</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Verificación de Trabajo */}
        {['in_progress', 'awaiting_confirmation', 'completed'].includes(contract.status) && (
          <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              Verificación de Trabajo
            </Text>

            {/* Horario original siempre visible */}
            <View style={[styles.originalHours, { backgroundColor: themeColors.slate[100] }]}>
              <Text style={[styles.originalHoursLabel, { color: themeColors.text.muted }]}>
                Horario original del contrato
              </Text>
              <Text style={[styles.originalHoursText, { color: themeColors.text.primary }]}>
                {new Date(contract.startDate).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} - {new Date(contract.endDate).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {/* Horas propuestas */}
            {contract.proposedStartTime && (
              <View style={[styles.proposedHours, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
                <Text style={[styles.proposedHoursLabel, { color: colors.primary[700] }]}>
                  Horas reportadas por {contract.confirmationProposedBy === (client?._id || client?.id) ? (client?.name || 'Cliente') : (doer?.name || 'Trabajador')}
                </Text>
                <Text style={[styles.proposedHoursText, { color: colors.primary[800] }]}>
                  {new Date(contract.proposedStartTime).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} - {new Date(contract.proposedEndTime!).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
                {contract.confirmationNotes ? (
                  <Text style={[styles.confirmNotesText, { color: colors.primary[600] }]}>
                    Notas: {contract.confirmationNotes}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Completado */}
            {contract.clientConfirmed && contract.doerConfirmed && (
              <View style={[styles.completedBanner, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
                <CheckCircle size={18} color={colors.success[600]} />
                <Text style={{ color: colors.success[700], fontSize: fontSize.sm, fontWeight: fontWeight.medium, flex: 1 }}>
                  Ambas partes han confirmado. Contrato completado.
                </Text>
              </View>
            )}

            {/* in_progress: nadie confirmó — boton para proponer horas */}
            {canProposeHours && !showHoursForm && (
              <>
                {isDoer && !doerCanConfirmYet && (
                  <View style={[styles.warningBanner, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                    <Clock size={16} color={colors.warning[600]} />
                    <Text style={{ color: colors.warning[700], fontSize: fontSize.sm, flex: 1 }}>
                      Podrás confirmar después del {new Date(new Date(contract.startDate).getTime() + (new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime()) * 0.3).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (30% del tiempo)
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.confirmButton, (isDoer && !doerCanConfirmYet) && styles.buttonDisabled]}
                  onPress={handleOpenHoursForm}
                  disabled={isDoer && !doerCanConfirmYet}
                >
                  <Clock size={20} color="#fff" />
                  <Text style={styles.confirmButtonText}>Confirmar / Cambiar Horas</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Formulario de horas */}
            {showHoursForm && (
              <View style={[styles.hoursForm, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <Text style={[styles.hoursFormTitle, { color: themeColors.text.primary }]}>
                  Indica las horas reales trabajadas
                </Text>
                <View style={styles.hoursRow}>
                  <View style={styles.hoursField}>
                    <Text style={[styles.hoursLabel, { color: themeColors.text.muted }]}>Fecha inicio</Text>
                    <TextInput style={[styles.hoursInput, { borderColor: themeColors.border, color: themeColors.text.primary }]} value={proposedStartDate} onChangeText={setProposedStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={themeColors.text.muted} />
                  </View>
                  <View style={styles.hoursField}>
                    <Text style={[styles.hoursLabel, { color: themeColors.text.muted }]}>Hora inicio</Text>
                    <TextInput style={[styles.hoursInput, { borderColor: themeColors.border, color: themeColors.text.primary }]} value={proposedStartTime} onChangeText={setProposedStartTime} placeholder="HH:MM" placeholderTextColor={themeColors.text.muted} />
                  </View>
                </View>
                <View style={styles.hoursRow}>
                  <View style={styles.hoursField}>
                    <Text style={[styles.hoursLabel, { color: themeColors.text.muted }]}>Fecha fin</Text>
                    <TextInput style={[styles.hoursInput, { borderColor: themeColors.border, color: themeColors.text.primary }]} value={proposedEndDate} onChangeText={setProposedEndDate} placeholder="YYYY-MM-DD" placeholderTextColor={themeColors.text.muted} />
                  </View>
                  <View style={styles.hoursField}>
                    <Text style={[styles.hoursLabel, { color: themeColors.text.muted }]}>Hora fin</Text>
                    <TextInput style={[styles.hoursInput, { borderColor: themeColors.border, color: themeColors.text.primary }]} value={proposedEndTime} onChangeText={setProposedEndTime} placeholder="HH:MM" placeholderTextColor={themeColors.text.muted} />
                  </View>
                </View>
                <TextInput style={[styles.hoursInput, styles.notesInput, { borderColor: themeColors.border, color: themeColors.text.primary }]} value={confirmNotes} onChangeText={setConfirmNotes} placeholder="Notas (opcional)" placeholderTextColor={themeColors.text.muted} multiline />
                <View style={styles.hoursActions}>
                  <TouchableOpacity style={[styles.confirmButton, { flex: 1 }, confirming && styles.buttonDisabled]} onPress={handleProposeHours} disabled={confirming}>
                    {confirming ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <CheckCircle size={18} color="#fff" />
                        <Text style={styles.confirmButtonText}>Confirmar Horas</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cancelFormButton, { borderColor: themeColors.border }]} onPress={() => setShowHoursForm(false)}>
                    <Text style={{ color: themeColors.text.secondary, fontSize: fontSize.sm }}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* awaiting_confirmation: soy quien propuso → esperando */}
            {contract.status === 'awaiting_confirmation' && contract.confirmationProposedBy === userId && (
              <View style={[styles.infoBanner, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
                <Clock size={16} color={colors.primary[600]} />
                <Text style={{ color: colors.primary[700], fontSize: fontSize.sm, flex: 1 }}>
                  Has confirmado tus horas. Esperando revisión de la otra parte. (Auto-confirmación en 5 horas)
                </Text>
              </View>
            )}

            {/* awaiting_confirmation: soy quien debe revisar → confirmar/rechazar */}
            {canReview && !showRejectForm && (
              <View style={styles.reviewActions}>
                <TouchableOpacity style={[styles.confirmButton, confirming && styles.buttonDisabled]} onPress={handleConfirmOtherParty} disabled={confirming}>
                  {confirming ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <CheckCircle size={20} color="#fff" />
                      <Text style={styles.confirmButtonText}>Confirmar y Liberar Pago</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectButton} onPress={() => { setRejectionReason(''); setShowRejectForm(true); }}>
                  <XCircle size={20} color="#fff" />
                  <Text style={styles.rejectButtonText}>Rechazar y Abrir Disputa</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Formulario de rechazo */}
            {showRejectForm && (
              <View style={[styles.hoursForm, { backgroundColor: themeColors.background, borderColor: colors.danger[200] }]}>
                <Text style={[styles.hoursFormTitle, { color: colors.danger[700] }]}>
                  Motivo del rechazo
                </Text>
                <Text style={{ color: themeColors.text.muted, fontSize: fontSize.xs, marginBottom: spacing.sm }}>
                  Se creará una disputa automáticamente para que un administrador resuelva.
                </Text>
                <TextInput style={[styles.hoursInput, styles.notesInput, { borderColor: colors.danger[300], color: themeColors.text.primary }]} value={rejectionReason} onChangeText={setRejectionReason} placeholder="Describe el motivo del rechazo" placeholderTextColor={themeColors.text.muted} multiline />
                <View style={styles.hoursActions}>
                  <TouchableOpacity style={[styles.rejectButton, { flex: 1 }, (confirming || !rejectionReason.trim()) && styles.buttonDisabled]} onPress={handleReject} disabled={confirming || !rejectionReason.trim()}>
                    {confirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectButtonText}>Rechazar y Crear Disputa</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cancelFormButton, { borderColor: themeColors.border }]} onPress={() => setShowRejectForm(false)}>
                    <Text style={{ color: themeColors.text.secondary, fontSize: fontSize.sm }}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.chatButton, { borderColor: themeColors.primary[600] }]}
            onPress={() => {
              // Navigate to chat
            }}
          >
            <MessageCircle size={20} color={themeColors.primary[600]} />
            <Text style={[styles.chatButtonText, { color: themeColors.primary[600] }]}>
              Ir al chat
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  statusCard: {
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  section: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  jobTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  jobCategory: {
    fontSize: fontSize.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  partyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  partyInfo: {
    flex: 1,
  },
  partyRole: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  partyName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
  confirmTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  confirmText: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  confirmStatus: {
    gap: spacing.sm,
  },
  confirmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmItemText: {
    fontSize: fontSize.sm,
  },
  actions: {
    gap: spacing.md,
  },
  confirmButton: {
    height: 52,
    backgroundColor: colors.success[500],
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  chatButton: {
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chatButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  originalHours: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  originalHoursLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  originalHoursText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  proposedHours: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  proposedHoursLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  proposedHoursText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  confirmNotesText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  hoursForm: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  hoursFormTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  hoursField: {
    flex: 1,
  },
  hoursLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  hoursInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  hoursActions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  cancelFormButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  reviewActions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  rejectButton: {
    height: 52,
    backgroundColor: colors.danger[500],
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  // Location map section
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  locationIconWrap: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationMain: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  locationSub: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  openMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: borderRadius.lg,
  },
  openMapBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
