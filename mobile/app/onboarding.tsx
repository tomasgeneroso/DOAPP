import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import Pantalla from '../components/Pantalla';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { getCategories } from '../services/jobs';
import { alternarInteres, interesesValidos, terminarOnboarding } from '../services/onboarding';

/** Bienvenida: qué tipo de trabajos te interesan, para mostrarte las mejores oportunidades. Se puede saltar. */
export default function OnboardingScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user, refreshUser, isAuthenticated, isLoading } = useAuth();
  const categorias = getCategories();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/(auth)/login' as any);
  }, [isLoading, isAuthenticated]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const terminar = async (intereses: string[]) => {
    setGuardando(true);
    setError('');
    try {
      const r = await terminarOnboarding(intereses);
      if (r.ok) {
        await refreshUser();
        router.replace('/(tabs)' as any);
      } else setError(r.mensaje);
    } catch {
      setError('No se pudo guardar. Revisá tu conexión y probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const primerNombre = user?.name ? String(user.name).split(' ')[0] : '';

  return (
    <Pantalla titulo="Tus intereses" error={error} volverA="/(tabs)">
      <Text style={[styles.titulo, { color: themeColors.text.primary }]}>¡Te damos la bienvenida{primerNombre ? `, ${primerNombre}` : ''}!</Text>
      <Text style={[styles.texto, { color: themeColors.text.secondary }]}>
        Contanos qué tipo de trabajos te interesan para mostrarte las mejores oportunidades. Lo podés cambiar cuando quieras.
      </Text>

      <View style={styles.grilla}>
        {categorias.map((c) => {
          const elegida = elegidos.includes(c.id);
          return (
            <TouchableOpacity
              key={c.id}
              onPress={() => setElegidos((prev) => alternarInteres(prev, c.id))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: elegida }}
              style={[
                styles.categoria,
                { borderColor: elegida ? colors.primary[600] : themeColors.border, backgroundColor: elegida ? colors.primary[50] : themeColors.card },
              ]}
            >
              {elegida && <View style={styles.tilde}><Check size={16} color={colors.primary[600]} /></View>}
              <Text style={styles.icono}>{c.icon}</Text>
              <Text style={{ color: elegida ? colors.primary[700] : themeColors.text.primary, fontSize: fontSize.sm, textAlign: 'center' }}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.boton, (guardando || elegidos.length === 0) && { opacity: 0.5 }]}
        onPress={() => terminar(interesesValidos(elegidos, categorias))}
        disabled={guardando || elegidos.length === 0}
      >
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Continuar{elegidos.length ? ` (${elegidos.length})` : ''}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => terminar([])} disabled={guardando} style={{ marginTop: spacing.md }}>
        <Text style={{ color: themeColors.text.secondary, textAlign: 'center' }}>Saltar por ahora</Text>
      </TouchableOpacity>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  texto: { fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.lg },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  categoria: { width: '31%', borderWidth: 2, borderRadius: borderRadius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center', gap: spacing.xs },
  tilde: { position: 'absolute', top: 4, right: 4 },
  icono: { fontSize: 28 },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
