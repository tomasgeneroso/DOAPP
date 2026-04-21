import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

const SUPPORT_EMAIL = 'support@doapp.com.ar';

export default function BannedScreen() {
  const { colors: themeColors } = useTheme();
  const { user, logout } = useAuth();
  const [appealText, setAppealText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitAppeal = async () => {
    if (!appealText.trim()) {
      Alert.alert('Error', 'Por favor ingresá el motivo de tu apelación');
      return;
    }
    setSubmitting(true);
    try {
      const res = await post<any>('/tickets', {
        subject: 'Apelación de suspensión - Solicitud de revisión',
        message: appealText,
        priority: 'high',
        category: 'account',
      });
      if (res.success) {
        setSubmitted(true);
        setAppealText('');
      } else {
        Alert.alert('Error', (res as any).message || 'Error al enviar la apelación');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Cerrás sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.banIconBg}>
            <Text style={styles.banIcon}>🚫</Text>
          </View>
          <Text style={styles.headerTitle}>Cuenta suspendida</Text>
          <Text style={styles.headerSubtitle}>
            Tu cuenta fue suspendida y no podés acceder a la plataforma en este momento.
          </Text>
        </View>

        {/* Ban Details */}
        {(user?.banReason || user?.bannedAt) && (
          <View style={styles.banDetailsCard}>
            <Text style={styles.banDetailsTitle}>⚠️ Motivo de suspensión</Text>
            <Text style={styles.banReason}>{user?.banReason || 'No se especificó un motivo'}</Text>
            {user?.bannedAt && (
              <Text style={styles.banDate}>
                Fecha: {new Date(user.bannedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            )}
            {user?.banExpiresAt && (
              <Text style={styles.banDate}>
                Vence: {new Date(user.banExpiresAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            )}
          </View>
        )}

        {/* Appeal Form */}
        <View style={styles.appealCard}>
          {!submitted ? (
            <>
              <Text style={styles.appealTitle}>Solicitar revisión</Text>
              <Text style={styles.appealDesc}>
                Si creés que esta suspensión es un error o querés apelar, completá el siguiente formulario. Nuestro equipo revisará tu caso.
              </Text>
              <TextInput
                style={styles.textArea}
                value={appealText}
                onChangeText={setAppealText}
                placeholder="Explicá por qué creés que esta suspensión debe ser revisada..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmitAppeal}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>📨 Enviar apelación</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.successBox}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successTitle}>Apelación enviada</Text>
              <Text style={styles.successText}>
                Tu apelación fue enviada. Nuestro equipo la revisará y se pondrá en contacto por email.
              </Text>
            </View>
          )}
        </View>

        {/* Support Contact */}
        <View style={styles.supportCard}>
          <Text style={styles.supportText}>¿Necesitás ayuda? Contactá al soporte:</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            <Text style={styles.supportEmail}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>🚪 Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fef2f2' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  banIconBg: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  banIcon: { fontSize: 48 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  headerSubtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  banDetailsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: '#fca5a5' },
  banDetailsTitle: { fontSize: 15, fontWeight: '700', color: '#991b1b', marginBottom: 8 },
  banReason: { fontSize: 14, color: '#7f1d1d', lineHeight: 20, marginBottom: 6 },
  banDate: { fontSize: 13, color: '#b91c1c' },
  appealCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16 },
  appealTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  appealDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 16 },
  textArea: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827', minHeight: 130, marginBottom: 16 },
  submitBtn: { backgroundColor: '#2563eb', borderRadius: 12, padding: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  successBox: { alignItems: 'center', padding: 16 },
  successIcon: { fontSize: 48, marginBottom: 12 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#065f46', marginBottom: 8 },
  successText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  supportCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center' },
  supportText: { fontSize: 14, color: '#6b7280', marginBottom: 6 },
  supportEmail: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
  logoutBtn: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  logoutBtnText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});
