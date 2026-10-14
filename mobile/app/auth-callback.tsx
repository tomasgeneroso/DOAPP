import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { esCodigoDeIngreso } from '../services/ingresoSocial';

/**
 * A donde llega la app cuando la web la abre con `doapp://auth-callback?codigo=…` después de entrar con Google o X.
 * Canjea el código (2 minutos, un solo uso) por la sesión y sigue: si la cuenta no tiene DNI, lo pide primero.
 */
export default function AuthCallback() {
  const { codigo } = useLocalSearchParams<{ codigo?: string }>();
  const { loginWithCode } = useAuth();
  const { colors: themeColors } = useTheme();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // El código se gasta al canjearlo: aunque la pantalla se vuelva a montar, se canjea una sola vez.
  const usado = useRef(false);

  useEffect(() => {
    if (usado.current) return;
    usado.current = true;
    if (!esCodigoDeIngreso(codigo)) {
      setError('Este enlace no sirve. Volvé a tocar «Ingresar con Google» o «Ingresar con X».');
      return;
    }
    (async () => {
      try {
        const r = await loginWithCode(codigo);
        if (!r.success) {
          setError(r.message || 'El ingreso venció o ya se usó. Volvé a intentarlo.');
          return;
        }
        router.replace((r.data?.needsDni ? '/(auth)/completar-registro' : '/(tabs)') as any);
      } catch (e: any) {
        setError(e?.message || 'No pudimos iniciar tu sesión. Revisá tu conexión y volvé a intentarlo.');
      }
    })();
  }, [codigo]);

  return (
    <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
      {error ? (
        <View style={styles.centro}>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>No pudimos ingresar</Text>
          <Text style={[styles.texto, { color: themeColors.text.secondary }]}>{error}</Text>
          <TouchableOpacity style={styles.boton} onPress={() => router.replace('/(auth)/login' as any)}>
            <Text style={styles.botonTexto}>Volver a ingresar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.centro}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={[styles.texto, { color: themeColors.text.secondary }]}>Iniciando tu sesión…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  titulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  texto: { fontSize: fontSize.base, textAlign: 'center' },
  boton: { backgroundColor: '#0284c7', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.lg },
  botonTexto: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.base },
});
