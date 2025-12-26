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
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getContract, confirmContract } from '../../services/contracts';
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

  const handleConfirm = async () => {
    Alert.alert(
      'Confirmar finalización',
      '¿Estás seguro de que el trabajo ha sido completado satisfactoriamente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setConfirming(true);
            try {
              const response = await confirmContract(id!);
              if (response.success) {
                Alert.alert('Confirmado', 'Tu confirmación ha sido registrada');
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
  const canConfirm =
    contract.status === 'awaiting_confirmation' &&
    ((isClient && !contract.clientConfirmed) || (isDoer && !contract.doerConfirmed));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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

        {/* Confirmation */}
        {contract.status === 'awaiting_confirmation' && (
          <View style={[styles.section, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
            <Text style={[styles.confirmTitle, { color: colors.warning[700] }]}>
              Confirmaciones requeridas
            </Text>
            <Text style={[styles.confirmText, { color: colors.warning[600] }]}>
              Ambas partes deben confirmar que el trabajo fue completado satisfactoriamente.
            </Text>

            <View style={styles.confirmStatus}>
              <View style={styles.confirmItem}>
                {contract.clientConfirmed ? (
                  <CheckCircle size={20} color={colors.success[500]} />
                ) : (
                  <Clock size={20} color={colors.warning[500]} />
                )}
                <Text style={[styles.confirmItemText, { color: colors.warning[700] }]}>
                  Cliente: {contract.clientConfirmed ? 'Confirmado' : 'Pendiente'}
                </Text>
              </View>

              <View style={styles.confirmItem}>
                {contract.doerConfirmed ? (
                  <CheckCircle size={20} color={colors.success[500]} />
                ) : (
                  <Clock size={20} color={colors.warning[500]} />
                )}
                <Text style={[styles.confirmItemText, { color: colors.warning[700] }]}>
                  Trabajador: {contract.doerConfirmed ? 'Confirmado' : 'Pendiente'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {canConfirm && (
            <TouchableOpacity
              style={[styles.confirmButton, confirming && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={confirming}
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <CheckCircle size={20} color="#fff" />
                  <Text style={styles.confirmButtonText}>Confirmar finalización</Text>
                </>
              )}
            </TouchableOpacity>
          )}

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
});
