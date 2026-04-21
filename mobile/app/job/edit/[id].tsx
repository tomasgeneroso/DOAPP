import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { get, put } from '../../../services/api';
import { getCategories } from '../../../services/jobs';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../constants/theme';

export default function EditJobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [jobStatus, setJobStatus] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endDateFlexible, setEndDateFlexible] = useState(false);

  const categories = getCategories();

  useEffect(() => {
    if (id) fetchJob();
  }, [id]);

  const fetchJob = async () => {
    try {
      const res = await get<any>(`/jobs/${id}`);
      if (res.success && res.job) {
        const j = res.job;
        const clientId = typeof j.client === 'string' ? j.client : j.client?.id;
        if (clientId !== user?.id) {
          setError('No tenés permiso para editar este trabajo');
          return;
        }
        setTitle(j.title || '');
        setDescription(j.description || '');
        setPrice(j.price?.toString() || '');
        setCategory(j.category || '');
        setLocation(j.location || '');
        setNeighborhood(j.neighborhood || '');
        setStartDate(j.startDate ? j.startDate.slice(0, 10) : '');
        setEndDate(j.endDate ? j.endDate.slice(0, 10) : '');
        setEndDateFlexible(j.endDateFlexible || false);
        setJobStatus(j.status || '');
      } else {
        setError('No se pudo cargar el trabajo');
      }
    } catch (err: any) {
      setError(err.message || 'Error cargando el trabajo');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('El título es requerido'); return; }
    if (!price || isNaN(Number(price))) { setError('El precio debe ser un número válido'); return; }
    if (!category) { setError('Seleccioná una categoría'); return; }

    setSaving(true);
    setError('');
    try {
      const body: any = {
        title, description, price: Number(price), category,
        location, neighborhood, endDateFlexible,
      };
      if (startDate) body.startDate = startDate;
      if (!endDateFlexible && endDate) body.endDate = endDate;

      const res = await put<any>(`/jobs/${id}`, body);
      if (res.success) {
        Alert.alert('¡Guardado!', 'Los cambios fueron guardados.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        setError((res as any).message || 'Error al guardar');
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary[500]} size="large" /></View>
      </SafeAreaView>
    );
  }

  const inputStyle = [styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }];
  const labelStyle = [styles.label, { color: themeColors.text.primary }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: themeColors.text.primary }]}>Editar trabajo</Text>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          {jobStatus && !['draft', 'open', 'pending_payment'].includes(jobStatus) && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>⚠️ Este trabajo está en estado "{jobStatus}". Solo podés editar algunos campos.</Text>
            </View>
          )}

          <Text style={labelStyle}>Título *</Text>
          <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Título del trabajo" placeholderTextColor={themeColors.text.muted} />

          <Text style={labelStyle}>Descripción</Text>
          <TextInput
            style={[inputStyle, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
            value={description} onChangeText={setDescription}
            placeholder="Describí el trabajo en detalle" placeholderTextColor={themeColors.text.muted}
            multiline numberOfLines={4}
          />

          <Text style={labelStyle}>Precio (ARS) *</Text>
          <TextInput style={inputStyle} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={themeColors.text.muted} />

          <Text style={labelStyle}>Categoría *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: 4 }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, { borderColor: category === cat.id ? colors.primary[500] : themeColors.border, backgroundColor: category === cat.id ? colors.primary[50] : themeColors.card }]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Text style={[styles.catChipText, { color: category === cat.id ? colors.primary[700] : themeColors.text.secondary }]}>
                    {cat.icon} {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={labelStyle}>Ubicación</Text>
          <TextInput style={inputStyle} value={location} onChangeText={setLocation} placeholder="Ciudad / Localidad" placeholderTextColor={themeColors.text.muted} />

          <Text style={labelStyle}>Barrio / Zona</Text>
          <TextInput style={inputStyle} value={neighborhood} onChangeText={setNeighborhood} placeholder="Barrio (opcional)" placeholderTextColor={themeColors.text.muted} />

          <Text style={labelStyle}>Fecha de inicio</Text>
          <TextInput style={inputStyle} value={startDate} onChangeText={setStartDate} placeholder="AAAA-MM-DD" placeholderTextColor={themeColors.text.muted} keyboardType="numbers-and-punctuation" />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Fecha de fin flexible</Text>
              <Text style={[styles.switchDesc, { color: themeColors.text.muted }]}>Sin fecha de fin definida</Text>
            </View>
            <Switch value={endDateFlexible} onValueChange={setEndDateFlexible} trackColor={{ false: themeColors.border, true: colors.primary[500] }} thumbColor="#fff" />
          </View>

          {!endDateFlexible && (
            <>
              <Text style={labelStyle}>Fecha de fin</Text>
              <TextInput style={inputStyle} value={endDate} onChangeText={setEndDate} placeholder="AAAA-MM-DD" placeholderTextColor={themeColors.text.muted} keyboardType="numbers-and-punctuation" />
            </>
          )}

          <TouchableOpacity style={[styles.saveFullBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar cambios</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  saveBtn: { backgroundColor: colors.primary[600], paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#dc2626', fontSize: 14 },
  warnBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 12, marginBottom: 16 },
  warnText: { color: '#92400e', fontSize: 13 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 13, fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  switchDesc: { fontSize: 12, marginTop: 2 },
  saveFullBtn: { backgroundColor: colors.primary[600], borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
});
