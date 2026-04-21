import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Crown, Check, Zap, Shield, BarChart3, AlertCircle, CreditCard } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

const PLAN_DETAILS: Record<string, any> = {
  monthly: {
    name: 'PRO Mensual',
    period: '/mes',
    color: '#7c3aed',
    benefits: ['1 contrato/mes sin comisión', 'Comisión 3% en contratos adicionales', 'Badge PRO verificado', 'Prioridad en búsquedas', 'Estadísticas avanzadas'],
  },
  quarterly: {
    name: 'PRO Trimestral',
    period: 'cada 3 meses',
    color: '#059669',
    savings: '11% de descuento',
    benefits: ['Todo lo del PRO Mensual', 'Ahorrás $1.650 vs 3 meses', '3 contratos/mes sin comisión'],
  },
  super_pro: {
    name: 'SUPER PRO',
    period: '/mes',
    color: '#db2777',
    benefits: ['2 contratos/mes sin comisión', 'Comisión solo 1%', 'Dashboard exclusivo', 'Analytics de perfil', 'Reportes mensuales automatizados', 'Todo lo de PRO'],
  },
};

export default function MembershipCheckoutScreen() {
  const router = useRouter();
  const { plan = 'monthly' } = useLocalSearchParams<{ plan: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadPricing(); }, []);

  const loadPricing = async () => {
    try {
      const res = await get<any>('/membership/pricing');
      if (res.success) setPricing((res as any).pricing);
    } catch (err) {
      console.error('Error loading pricing:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = () => {
    if (!pricing) return 0;
    if (plan === 'super_pro') return pricing.superPro?.priceARS || 8999;
    if (plan === 'quarterly') return (pricing.pro?.priceARS || 4999) * 3 * 0.89;
    return pricing.pro?.priceARS || 4999;
  };

  const handlePay = async () => {
    setProcessing(true);
    setError('');
    try {
      const res = await post<any>('/membership/create-payment', { plan });
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

  const planInfo = PLAN_DETAILS[plan] || PLAN_DETAILS.monthly;
  const price = getPrice();

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
        <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error ? (
          <View style={styles.errorBox}>
            <AlertCircle size={18} color="#dc2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Plan Header */}
        <View style={[styles.planCard, { borderColor: planInfo.color, backgroundColor: themeColors.card }]}>
          <View style={[styles.planIconBg, { backgroundColor: planInfo.color + '20' }]}>
            {plan === 'super_pro' ? <Zap size={28} color={planInfo.color} /> : <Crown size={28} color={planInfo.color} />}
          </View>
          <Text style={[styles.planName, { color: planInfo.color }]}>{planInfo.name}</Text>
          {planInfo.savings && (
            <View style={[styles.savingsBadge, { backgroundColor: '#d1fae5' }]}>
              <Text style={styles.savingsText}>{planInfo.savings}</Text>
            </View>
          )}
          <Text style={[styles.priceText, { color: themeColors.text.primary }]}>
            ${Number(price).toLocaleString('es-AR')} ARS
          </Text>
          <Text style={[styles.periodText, { color: themeColors.text.secondary }]}>{planInfo.period}</Text>
        </View>

        {/* Benefits */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Beneficios incluidos</Text>
          {planInfo.benefits.map((b: string) => (
            <View key={b} style={styles.benefitRow}>
              <Check size={16} color="#10b981" />
              <Text style={[styles.benefitText, { color: themeColors.text.secondary }]}>{b}</Text>
            </View>
          ))}
        </View>

        {/* User Info */}
        {user && (
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Plan actual</Text>
            <Text style={[styles.currentPlan, { color: themeColors.text.secondary }]}>
              Actualmente en plan {user.membershipType === 'pro' ? 'PRO' : user.membershipType === 'super_pro' ? 'SUPER PRO' : 'FREE'}
            </Text>
          </View>
        )}

        {/* Pay Button */}
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: planInfo.color }, processing && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <CreditCard size={20} color="#fff" />
              <Text style={styles.payBtnText}>Suscribirse con MercadoPago</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: themeColors.text.muted }]}>
          Podés cancelar tu suscripción en cualquier momento. Serás redirigido a MercadoPago para completar el pago.
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
  planCard: { alignItems: 'center', borderRadius: 20, borderWidth: 2, padding: 24, marginBottom: 16 },
  planIconBg: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  planName: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  savingsBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  savingsText: { fontSize: 13, fontWeight: '700', color: '#065f46' },
  priceText: { fontSize: 36, fontWeight: '800' },
  periodText: { fontSize: 14, marginTop: 2 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  benefitText: { fontSize: 14, flex: 1, lineHeight: 20 },
  currentPlan: { fontSize: 14 },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, height: 56, marginTop: 8 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disclaimer: { fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
