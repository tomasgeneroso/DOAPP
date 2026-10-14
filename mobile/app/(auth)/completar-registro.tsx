import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { put } from '../../services/api';
import { spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import ContactarSoporte from '../../components/ContactarSoporte';

/**
 * Quien entra con Google o X por primera vez todavía no tiene DNI, y el DNI es la clave de la cuenta (no se repite). Se pide
 * antes de seguir, igual que en la web (`/complete-registration`). Sin DNI no se avanza.
 */
export default function CompletarRegistro() {
  const { colors: themeColors } = useTheme();
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [dni, setDni] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const guardar = async () => {
    setError(null);
    if (!/^\d{7,9}$/.test(dni)) {
      setError('El DNI debe tener entre 7 y 9 dígitos, solo números.');
      return;
    }
    setCargando(true);
    try {
      const r: any = await put('/auth/complete-registration', { dni });
      if (!r.success) {
        setError(r.message || r.errors?.[0]?.msg || 'No pudimos guardar tu DNI.');
        return;
      }
      await refreshUser();
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      setError(e?.message || 'Error de conexión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centro}>
        <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Un último paso</Text>
        <Text style={[styles.texto, { color: themeColors.text.secondary }]}>
          Ingresá tu DNI. Es la clave de tu cuenta: no se puede repetir y después lo verificás con tu documento.
        </Text>
        <TextInput
          style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border, backgroundColor: themeColors.card }]}
          placeholder="12345678"
          placeholderTextColor={themeColors.text.muted}
          value={dni}
          onChangeText={(v) => setDni(v.replace(/\D/g, '').slice(0, 9))}
          keyboardType="number-pad"
          maxLength={9}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={[styles.boton, cargando && { opacity: 0.6 }]} onPress={guardar} disabled={cargando}>
          {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Continuar</Text>}
        </TouchableOpacity>
        <View style={{ alignSelf: 'stretch' }}>
          <ContactarSoporte tema="registrarte" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  centro: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  titulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  texto: { fontSize: fontSize.base },
  input: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.lg },
  error: { color: '#dc2626', fontSize: fontSize.sm },
  boton: { backgroundColor: '#0284c7', paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  botonTexto: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.base },
});
