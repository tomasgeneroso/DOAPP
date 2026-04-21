import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, XCircle, Clock, DollarSign, Calendar, MapPin, MessageCircle, User } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { get, put } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pendiente',  color: '#92400e', bg: '#fef3c7' },
  approved:  { label: 'Aprobada',   color: '#065f46', bg: '#d1fae5' },
  rejected:  { label: 'Rechazada',  color: '#991b1b', bg: '#fee2e2' },
  withdrawn: { label: 'Retirada',   color: '#374151', bg: '#f3f4f6' },
  cancelled: { label: 'Cancelada',  color: '#991b1b', bg: '#fee2e2' },
};

export default function ProposalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { if (id) loadProposal(); }, [id]);

  const loadProposal = async () => {
    try {
      const res = await get<any>(`/proposals/${id}`);
      if (res.success) setProposal(res.proposal);
    } catch (err) {
      console.error('Error loading proposal:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    Alert.alert('Aceptar propuesta', '¿Aceptás esta propuesta? Se creará el contrato automáticamente.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aceptar', style: 'default', onPress: async () => {
        setActionLoading(true);
        try {
          const res = await put<any>(`/proposals/${proposal._id || id}/approve`, {});
          if (res.success) {
            Alert.alert('¡Aprobada!', 'La propuesta fue aprobada y el contrato creado.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          } else {
            Alert.alert('Error', (res as any).message || 'Error al aceptar');
          }
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Error de conexión');
        } finally {
          setActionLoading(false);
        }
      }},
    ]);
  };

  const handleReject = () => {
    Alert.prompt('Rechazar propuesta', '¿Por qué rechazás esta propuesta? (opcional)', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: async (reason) => {
        setActionLoading(true);
        try {
          const res = await put<any>(`/proposals/${proposal._id || id}/reject`, { reason: reason || '' });
          if (res.success) {
            Alert.alert('Rechazada', 'La propuesta fue rechazada.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          } else {
            Alert.alert('Error', (res as any).message || 'Error al rechazar');
          }
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Error de conexión');
        } finally {
          setActionLoading(false);
        }
      }},
    ]);
  };

  const handleWithdraw = () => {
    Alert.alert('Retirar propuesta', '¿Retirás tu propuesta para este trabajo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Retirar', style: 'destructive', onPress: async () => {
        setActionLoading(true);
        try {
          const res = await put<any>(`/proposals/${proposal._id || id}/withdraw`, {});
          if (res.success) {
            router.back();
          } else {
            Alert.alert('Error', (res as any).message || 'Error al retirar');
          }
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Error');
        } finally {
          setActionLoading(false);
        }
      }},
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary[500]} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!proposal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={24} color={themeColors.text.primary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Propuesta</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}><Text style={{ color: themeColors.text.secondary }}>No se encontró la propuesta</Text></View>
      </SafeAreaView>
    );
  }

  const status = STATUS_MAP[proposal.status] || STATUS_MAP.pending;
  const isClient = proposal.client?.id === user?.id || proposal.job?.clientId === user?.id;
  const isFreelancer = proposal.freelancer?.id === user?.id || proposal.doer?.id === user?.id;
  const freelancer = proposal.freelancer || proposal.doer || {};
  const job = proposal.job || {};

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={24} color={themeColors.text.primary} /></TouchableOpacity>
        <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Detalle de propuesta</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          {proposal.status === 'approved' ? <CheckCircle size={18} color={status.color} /> :
           proposal.status === 'rejected' ? <XCircle size={18} color={status.color} /> :
           <Clock size={18} color={status.color} />}
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>

        {/* Job Info */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Trabajo</Text>
          <Text style={[styles.jobTitle, { color: themeColors.text.primary }]}>{job.title || 'Sin título'}</Text>
          {job.location && (
            <View style={styles.infoRow}>
              <MapPin size={14} color={themeColors.text.muted} />
              <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>{job.location}</Text>
            </View>
          )}
          {job.price && (
            <View style={styles.infoRow}>
              <DollarSign size={14} color={themeColors.text.muted} />
              <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>Presupuesto: ${Number(job.price).toLocaleString('es-AR')} ARS</Text>
            </View>
          )}
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push(`/job/${job.id || job._id}`)}>
            <Text style={[styles.linkBtnText, { color: colors.primary[600] }]}>Ver trabajo →</Text>
          </TouchableOpacity>
        </View>

        {/* Freelancer Info */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Doer</Text>
          <View style={styles.userRow}>
            {freelancer.avatar ? (
              <Image source={{ uri: freelancer.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}><User size={20} color={colors.primary[600]} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: themeColors.text.primary }]}>{freelancer.name || 'Doer'}</Text>
              {freelancer.rating && (
                <Text style={[styles.userRating, { color: themeColors.text.secondary }]}>⭐ {Number(freelancer.rating).toFixed(1)}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => router.push(`/user/${freelancer.id || freelancer._id}`)}>
              <Text style={[styles.linkBtnText, { color: colors.primary[600] }]}>Ver perfil</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Proposal Details */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Detalles de la propuesta</Text>
          <View style={styles.detailRow}>
            <DollarSign size={16} color={themeColors.text.muted} />
            <Text style={[styles.detailLabel, { color: themeColors.text.secondary }]}>Precio propuesto:</Text>
            <Text style={[styles.detailValue, { color: colors.primary[600] }]}>${Number(proposal.proposedPrice || 0).toLocaleString('es-AR')} ARS</Text>
          </View>
          {proposal.estimatedDuration && (
            <View style={styles.detailRow}>
              <Calendar size={16} color={themeColors.text.muted} />
              <Text style={[styles.detailLabel, { color: themeColors.text.secondary }]}>Duración estimada:</Text>
              <Text style={[styles.detailValue, { color: themeColors.text.primary }]}>{proposal.estimatedDuration} días</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Clock size={16} color={themeColors.text.muted} />
            <Text style={[styles.detailLabel, { color: themeColors.text.secondary }]}>Enviada:</Text>
            <Text style={[styles.detailValue, { color: themeColors.text.primary }]}>{new Date(proposal.createdAt).toLocaleDateString('es-AR')}</Text>
          </View>
        </View>

        {/* Cover Letter */}
        {proposal.coverLetter && (
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Carta de presentación</Text>
            <Text style={[styles.coverLetter, { color: themeColors.text.secondary }]}>{proposal.coverLetter}</Text>
          </View>
        )}

        {/* Rejection Reason */}
        {proposal.status === 'rejected' && proposal.rejectionReason && (
          <View style={[styles.card, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <Text style={[styles.cardTitle, { color: '#991b1b' }]}>Motivo de rechazo</Text>
            <Text style={{ color: '#7f1d1d', fontSize: 14 }}>{proposal.rejectionReason}</Text>
          </View>
        )}

        {/* Actions */}
        {actionLoading && (
          <View style={styles.center}><ActivityIndicator color={colors.primary[500]} /></View>
        )}

        {isClient && proposal.status === 'pending' && !actionLoading && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={handleApprove}>
              <CheckCircle size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Aceptar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={handleReject}>
              <XCircle size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        )}

        {isFreelancer && proposal.status === 'pending' && !actionLoading && (
          <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn, { marginTop: 16 }]} onPress={handleWithdraw}>
            <Text style={styles.actionBtnText}>Retirar propuesta</Text>
          </TouchableOpacity>
        )}

        {isClient && proposal.status === 'approved' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary[600], marginTop: 16 }]}
            onPress={() => router.push(`/contracts/create?proposalId=${proposal._id || id}`)}
          >
            <Text style={styles.actionBtnText}>Crear contrato</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginBottom: 16 },
  statusText: { fontWeight: '600', fontSize: 14 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, opacity: 0.6 },
  jobTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { fontSize: 14 },
  linkBtn: { marginTop: 8 },
  linkBtnText: { fontSize: 14, fontWeight: '600' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '600' },
  userRating: { fontSize: 13, marginTop: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailLabel: { fontSize: 14, flex: 1 },
  detailValue: { fontSize: 14, fontWeight: '600' },
  coverLetter: { fontSize: 14, lineHeight: 22 },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  approveBtn: { backgroundColor: '#10b981' },
  rejectBtn: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
