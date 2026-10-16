import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, XCircle } from 'lucide-react-native';
import { confirmarVinculo } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { esCodigoDeIngreso } from '../services/ingresoSocial';

/**
 * A donde llega la app cuando la web la abre con `doapp://vinculo-callback?vinculo=…` después de enlazar Google o X desde
 * Configuración → Seguridad. El enlace lo hizo el navegador del teléfono, pero lo CONFIRMA la app con su propia sesión: el código solo
 * sirve (una vez, 5 minutos) para la misma persona que empezó el enlace, así que un enlace pasado a otra persona no enlaza nada.
 */
export default function VinculoCallback() {
  const { vinculo } = useLocalSearchParams<{ vinculo?: string }>();
  const { colors: themeColors } = useTheme();
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: 'cargando' } | { tipo: 'ok'; texto: string } | { tipo: 'error'; texto: string }>({ tipo: 'cargando' });
  // El código se gasta al confirmarlo: aunque la pantalla se vuelva a montar, se confirma una sola vez.
  const usado = useRef(false);

  useEffect(() => {
    if (usado.current) return;
    usado.current = true;
    if (!esCodigoDeIngreso(vinculo)) {
      setEstado({ tipo: 'error', texto: 'Este enlace no sirve. Volvé a Configuración → Seguridad y tocá otra vez «Enlazar».' });
      return;
    }
    (async () => {
      try {
        const r = await confirmarVinculo(vinculo);
        if (r.success) {
          await refreshUser?.();
          setEstado({ tipo: 'ok', texto: r.message || 'Listo: enlazaste tu cuenta.' });
        } else {
          setEstado({ tipo: 'error', texto: r.message || 'No pudimos enlazar la cuenta. Volvé a intentarlo.' });
        }
      } catch (e: any) {
        setEstado({ tipo: 'error', texto: e?.message || 'No pudimos enlazar la cuenta. Revisá tu conexión y volvé a intentarlo.' });
      }
    })();
  }, [vinculo]);

  const irASeguridad = () => router.replace('/settings?tab=seguridad' as any);

  return (
    <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
      <View style={styles.centro}>
        {estado.tipo === 'cargando' && (
          <>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={[styles.texto, { color: themeColors.text.secondary }]}>Enlazando tu cuenta…</Text>
          </>
        )}
        {estado.tipo === 'ok' && (
          <>
            <CheckCircle size={48} color="#059669" />
            <Text style={[styles.titulo, { color: themeColors.text.primary }]}>¡Listo!</Text>
            <Text style={[styles.texto, { color: themeColors.text.secondary }]}>{estado.texto}</Text>
          </>
        )}
        {estado.tipo === 'error' && (
          <>
            <XCircle size={48} color="#dc2626" />
            <Text style={[styles.titulo, { color: themeColors.text.primary }]}>No pudimos enlazar</Text>
            <Text style={[styles.texto, { color: themeColors.text.secondary }]}>{estado.texto}</Text>
          </>
        )}
        {estado.tipo !== 'cargando' && (
          <TouchableOpacity style={styles.boton} onPress={irASeguridad}>
            <Text style={styles.botonTexto}>Volver a Seguridad</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  titulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  texto: { fontSize: fontSize.base, textAlign: 'center' },
  boton: { backgroundColor: '#0284c7', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.lg, marginTop: spacing.md },
  botonTexto: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.base },
});
