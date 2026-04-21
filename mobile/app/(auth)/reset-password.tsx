import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors: themeColors } = useTheme();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!token) {
      setError('Token inválido. Solicitá un nuevo enlace de recuperación.');
      return;
    }
    try {
      setLoading(true);
      const res = await post<any>('/auth/reset-password', { token, newPassword: password });
      if (res.success) {
        setSuccess(true);
      } else {
        setError((res as any).message || 'Error al restablecer la contraseña');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.successContent}>
          <View style={styles.successIcon}><CheckCircle size={48} color="#fff" /></View>
          <Text style={[styles.title, { color: themeColors.text.primary, textAlign: 'center' }]}>¡Contraseña restablecida!</Text>
          <Text style={[styles.subtitle, { color: themeColors.text.secondary, textAlign: 'center' }]}>
            Tu contraseña fue actualizada. Podés iniciar sesión con tu nueva contraseña.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.buttonText}>Ir al login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/login')}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Nueva contraseña</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.iconContainer, { backgroundColor: '#e0f2fe' }]}>
            <Lock size={32} color={colors.primary[600]} />
          </View>

          <Text style={[styles.title, { color: themeColors.text.primary }]}>Restablecer contraseña</Text>
          <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>
            Ingresá tu nueva contraseña. Debe tener al menos 6 caracteres.
          </Text>

          {error ? (
            <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
          ) : null}

          {!token ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Token inválido o faltante. Solicitá un nuevo enlace.</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Nueva contraseña</Text>
            <View style={[styles.inputRow, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <TextInput
                style={[styles.input, { color: themeColors.text.primary }]}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={themeColors.text.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                {showPassword ? <EyeOff size={20} color={themeColors.text.muted} /> : <Eye size={20} color={themeColors.text.muted} />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Confirmar contraseña</Text>
            <View style={[styles.inputRow, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <TextInput
                style={[styles.input, { color: themeColors.text.primary }]}
                placeholder="Repetí la contraseña"
                placeholderTextColor={themeColors.text.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                {showConfirm ? <EyeOff size={20} color={themeColors.text.muted} /> : <Eye size={20} color={themeColors.text.muted} />}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, (!token || loading) && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={!token || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Restablecer contraseña</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: 17, fontWeight: '600' },
  scrollContent: { flexGrow: 1, padding: 24, paddingTop: 32 },
  iconContainer: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#dc2626', fontSize: 14 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 16 },
  input: { flex: 1, height: 52, fontSize: 16 },
  eyeBtn: { padding: 8 },
  button: { backgroundColor: colors.primary[600], borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  successContent: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
});
