import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, DollarSign, Calendar, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { get, post } from '../../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../constants/theme';

export default function JobApplyScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [coverLetter, setCoverLetter] = useState('Estoy interesado en realizar este trabajo. Me comprometo a cumplir con los requisitos y entregar un trabajo de calidad.');
  const [proposedPrice, setProposedPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { if (id) fetchJob(); }, [id]);

  const fetchJob = async () => {
    try {
      const res = await get<any>(`/jobs/${id}`);
      if (res.success) {
        setJob(res.job);
        setProposedPrice(res.job.price?.toString() || '');
      }
    } catch (err) {
      console.error('Error loading job:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!coverLetter.trim()) { Alert.alert('Error', 'Ingresá una carta de presentación'); return; }
    if (!proposedPrice || isNaN(Number(proposedPrice))) { Alert.alert('Error', 'Ingresá un precio válido'); return; }

    Alert.alert('Confirmar postulación', `¿Postularte para "${job?.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Postularme', onPress: async () => {
        setSubmitting(true);
        try {
          const res = await post<any>('/proposals', {
            jobId: id,
            coverLetter,
            proposedPrice: Number(proposedPrice),
          });
          if (res.success) {
            setSubmitted(true);
          } else {
            Alert.alert('Error', (res as any).message || 'Error al enviar postulación');
          }
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Error de conexión');
        } finally {
          setSubmitting(false);
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

  if (submitted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}>
          <CheckCircle size={64} color="#10b981" />
          <Text style={[styles.successTitle, { color: themeColors.text.primary }]}>¡Postulación enviada!</Text>
          <Text style={[styles.successText, { color: themeColors.text.secondary }]}>
            Tu propuesta fue enviada. El cliente revisará tu perfil y se comunicará con vos.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/proposals')}>
            <Text style={styles.buttonText}>Ver mis propuestas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonOutline, { borderColor: themeColors.border }]} onPress={() => router.back()}>
            <Text style={[styles.buttonText, { color: themeColors.text.primary }]}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={24} color={themeColors.text.primary} /></TouchableOpacity>
        <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Postularse</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Job Summary */}
          {job && (
            <View style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.jobTitle, { color: themeColors.text.primary }]}>{job.title}</Text>
              {job.location && (
                <View style={styles.jobMeta}>
                  <MapPin size={14} color={themeColors.text.muted} />
                  <Text style={[styles.jobMetaText, { color: themeColors.text.secondary }]}>{job.location}</Text>
                </View>
              )}
              <View style={styles.jobMeta}>
                <DollarSign size={14} color={themeColors.text.muted} />
                <Text style={[styles.jobMetaText, { color: colors.primary[600] }]}>
                  Presupuesto: ${Number(job.price).toLocaleString('es-AR')} ARS
                </Text>
              </View>
              {job.startDate && (
                <View style={styles.jobMeta}>
                  <Calendar size={14} color={themeColors.text.muted} />
                  <Text style={[styles.jobMetaText, { color: themeColors.text.secondary }]}>
                    Fecha: {new Date(job.startDate).toLocaleDateString('es-AR')}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={[styles.label, { color: themeColors.text.primary }]}>Tu precio propuesto (ARS)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
            value={proposedPrice}
            onChangeText={setProposedPrice}
            keyboardType="numeric"
            placeholder="Tu precio"
            placeholderTextColor={themeColors.text.muted}
          />

          <Text style={[styles.label, { color: themeColors.text.primary }]}>Carta de presentación</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
            value={coverLetter}
            onChangeText={setCoverLetter}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            placeholder="Presentate y explica por qué sos el indicado para este trabajo..."
            placeholderTextColor={themeColors.text.muted}
          />

          <TouchableOpacity
            style={[styles.button, submitting && { opacity: 0.6 }]}
            onPress={handleApply}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar postulación</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  jobCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
  jobTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  jobMetaText: { fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 16 },
  textArea: { height: 140, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary[600], borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  successTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  successText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
