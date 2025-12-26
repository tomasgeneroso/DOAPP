import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, FileText, MapPin, Calendar, DollarSign, ChevronRight, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getMyProposals, withdrawProposal } from '../../services/proposals';
import { Proposal, Job } from '../../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function ProposalsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const fetchProposals = async () => {
    try {
      const response = await getMyProposals();
      if (response.success && response.data) {
        setProposals(response.data.proposals || []);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProposals();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchProposals();
  }, [isAuthenticated]);

  const handleWithdraw = (proposalId: string) => {
    Alert.alert(
      'Retirar propuesta',
      '¿Estás seguro de que quieres retirar esta propuesta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Retirar',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(proposalId);
            try {
              const response = await withdrawProposal(proposalId);
              if (response.success) {
                Alert.alert('Propuesta retirada', 'Tu propuesta ha sido retirada');
                fetchProposals();
              } else {
                Alert.alert('Error', response.message || 'No se pudo retirar la propuesta');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Error de conexión');
            } finally {
              setWithdrawing(null);
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
      month: 'short',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return colors.success[500];
      case 'pending':
        return colors.warning[500];
      case 'rejected':
      case 'withdrawn':
        return colors.danger[500];
      default:
        return colors.slate[500];
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      withdrawn: 'Retirada',
    };
    return statusMap[status] || status;
  };

  const renderProposal = ({ item }: { item: Proposal }) => {
    const job = item.job as Job;

    return (
      <View style={[styles.proposalCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <TouchableOpacity
          style={styles.proposalContent}
          onPress={() => router.push(`/job/${job?._id || job?.id}`)}
        >
          <View style={styles.proposalHeader}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusText(item.status)}
              </Text>
            </View>
            <ChevronRight size={20} color={themeColors.text.muted} />
          </View>

          <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
            {job?.title || 'Trabajo'}
          </Text>

          <View style={styles.proposalInfo}>
            {item.proposedPrice && (
              <View style={styles.infoRow}>
                <DollarSign size={14} color={themeColors.primary[600]} />
                <Text style={[styles.infoText, { color: themeColors.primary[600], fontWeight: fontWeight.semibold }]}>
                  Tu oferta: {formatPrice(item.proposedPrice)}
                </Text>
              </View>
            )}

            {job?.location && (
              <View style={styles.infoRow}>
                <MapPin size={14} color={themeColors.text.muted} />
                <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
                  {job.location}
                </Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Calendar size={14} color={themeColors.text.muted} />
              <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
                Enviada el {formatDate(item.createdAt)}
              </Text>
            </View>
          </View>

          {item.message && (
            <View style={[styles.messageContainer, { backgroundColor: themeColors.slate[50] }]}>
              <Text style={[styles.messageLabel, { color: themeColors.text.muted }]}>
                Tu mensaje:
              </Text>
              <Text style={[styles.messageText, { color: themeColors.text.secondary }]} numberOfLines={2}>
                {item.message}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {item.status === 'pending' && (
          <TouchableOpacity
            style={[styles.withdrawButton, { borderTopColor: themeColors.border }]}
            onPress={() => handleWithdraw(item._id)}
            disabled={withdrawing === item._id}
          >
            {withdrawing === item._id ? (
              <ActivityIndicator size="small" color={colors.danger[500]} />
            ) : (
              <>
                <X size={16} color={colors.danger[500]} />
                <Text style={styles.withdrawButtonText}>Retirar propuesta</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Mis propuestas
          </Text>
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
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Mis propuestas
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={proposals}
        renderItem={renderProposal}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FileText size={48} color={themeColors.text.muted} />
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              No tienes propuestas
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
              Cuando apliques a trabajos, tus propuestas aparecerán aquí
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push('/(tabs)')}
            >
              <Text style={styles.browseButtonText}>Explorar trabajos</Text>
            </TouchableOpacity>
          </View>
        }
      />
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
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  proposalCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  proposalContent: {
    padding: spacing.lg,
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  jobTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  proposalInfo: {
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: {
    fontSize: fontSize.sm,
  },
  messageContainer: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  messageLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  messageText: {
    fontSize: fontSize.sm,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  withdrawButtonText: {
    color: colors.danger[500],
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  browseButton: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
