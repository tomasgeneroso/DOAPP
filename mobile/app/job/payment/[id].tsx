import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CreditCard, DollarSign, CheckCircle, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { get, post } from '../../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../constants/theme';

export default function JobPaymentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (id) loadJob(); }, [id]);

  const loadJob = async () => {
    try {
      const res = await get<any>(`/jobs/${id}`);
      if (res.success) setJob(res.job);
      else setError((res as any).message || 'Error cargando trabajo');
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const getCommissionRate = () => {
    if (user?.membershipType === 'super_pro') return 1;
    if (user?.membershipType === 'pro') return 3;
    return 8;
  };

  const calculateCommission = () => {
    const jobPrice = job?.price || 0;
    if (!jobPrice) return 0;
    if ((user?.freeContractsRemaining || 0) > 0) return 0;
    const rate = getCommissionRate();
    return Math.max(jobPrice * (rate / 100), 1000);
  };

  const isFreeContract = (user?.freeContractsRemaining || 0) > 0;
  const commission = calculateCommission();
  const jobPrice = job?.price || 0;
  const total = isFreeContract ? 0 : jobPrice + commission;

  const handlePay = async () => {
    setProcessing(true);
    setError('');
    try {
      const res = await post<any>(`/payments/create-order`, {
        jobId: id,
        type: 'job_publication',
      });
      if (res.success && (res as any).initPoint) {
        await Linking.openURL((res as any).initPoint);
        router.back();
      } else {
        setError((res as any).message || 'Error al iniciar el pago');
      }
    } catch (err: any) {
      setError(err.message || 'Error al procesar el pago');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary[500]} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={24} color={themeColors.text.primary} /></TouchableOpacity>
        <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Pagar publicación</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error ? (
          <View style={styles.errorBox}>
            <AlertCircle size={18} color="#dc2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Job Summary */}
        {job && (
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Trabajo a publicar</Text>
            <Text style={[styles.jobTitle, { color: themeColors.text.primary }]}>{job.title}</Text>
            <View style={styles.infoRow}>
              <DollarSign size={16} color={themeColors.text.muted} />
              <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
                Precio del trabajo: ${Number(jobPrice).toLocaleString('es-AR')} ARS
              </Text>
            </View>
          </View>
        )}

        {/* Cost Summary */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Resumen de costos</Text>

          {isFreeContract ? (
            <View style={[styles.freeBox, { backgroundColor: '#d1fae5', borderColor: '#6ee7b7' }]}>
              <CheckCircle size={20} color="#065f46" />
              <View>
                <Text style={styles.freeTitle}>¡Contrato gratuito!</Text>
                <Text style={styles.freeSubtitle}>Tenés {user?.freeContractsRemaining} contratos gratis disponibles. Sin comisión.</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: themeColors.text.secondary }]}>Precio del trabajo</Text>
                <Text style={[styles.costValue, { color: themeColors.text.primary }]}>${Number(jobPrice).toLocaleString('es-AR')}</Text>
              </View>
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: themeColors.text.secondary }]}>Comisión ({getCommissionRate()}%)</Text>
                <Text style={[styles.costValue, { color: themeColors.text.primary }]}>${Number(commission).toLocaleString('es-AR')}</Text>
              </View>
              <View style={[styles.costRow, styles.totalRow]}>
                <Text style={[styles.costLabel, styles.totalLabel, { color: themeColors.text.primary }]}>Total a pagar</Text>
                <Text style={[styles.costValue, styles.totalValue, { color: colors.primary[600] }]}>${Number(total).toLocaleString('es-AR')} ARS</Text>
              </View>
            </>
          )}
        </View>

        {/* Plan Info */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Tu plan actual</Text>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: themeColors.text.secondary }]}>Plan:</Text>
            <Text style={[styles.planValue, { color: themeColors.text.primary }]}>
              {user?.membershipType === 'super_pro' ? 'SUPER PRO' : user?.membershipType === 'pro' ? 'PRO' : 'FREE'}
            </Text>
          </View>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: themeColors.text.secondary }]}>Comisión:</Text>
            <Text style={[styles.planValue, { color: themeColors.text.primary }]}>{getCommissionRate()}%</Text>
          </View>
          {(user?.freeContractsRemaining || 0) > 0 && (
            <View style={styles.planRow}>
              <Text style={[styles.planLabel, { color: themeColors.text.secondary }]}>Contratos gratis:</Text>
              <Text style={[styles.planValue, { color: '#10b981' }]}>{user?.freeContractsRemaining}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.payBtn, processing && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <CreditCard size={20} color="#fff" />
              <Text style={styles.payBtnText}>
                {isFreeContract ? 'Publicar gratis' : `Pagar $${Number(total).toLocaleString('es-AR')} ARS`}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: themeColors.text.muted }]}>
          Serás redirigido a MercadoPago para completar el pago de forma segura.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: '#dc2626', fontSize: 14, flex: 1 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, opacity: 0.6 },
  jobTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 14 },
  freeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  freeTitle: { fontSize: 15, fontWeight: '700', color: '#065f46' },
  freeSubtitle: { fontSize: 13, color: '#065f46', marginTop: 2 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  costLabel: { fontSize: 14 },
  costValue: { fontSize: 14, fontWeight: '600' },
  totalRow: { borderBottomWidth: 0, paddingTop: 12 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  planRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  planLabel: { fontSize: 14 },
  planValue: { fontSize: 14, fontWeight: '600' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.primary[600], borderRadius: 14, height: 56, marginTop: 8 },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disclaimer: { fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
