import { ReactNode } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, fontSize, fontWeight } from '../constants/theme';

/**
 * Marco común de las pantallas nuevas de la app: barra superior con «volver» y título, indicador de carga, aviso de error
 * y, si se la pasa `onRefrescar`, arrastrar para actualizar. Cada pantalla pone solo su contenido.
 */
export default function Pantalla({
  titulo,
  children,
  cargando = false,
  error,
  onRefrescar,
  refrescando = false,
  volverA = '/(tabs)/profile',
  derecha,
  conScroll = true,
  sinBarra = false,
}: {
  titulo: string;
  children?: ReactNode;
  cargando?: boolean;
  error?: string;
  onRefrescar?: () => void;
  refrescando?: boolean;
  volverA?: string;
  derecha?: ReactNode;
  conScroll?: boolean;
  /** Para las pantallas de administración, que ya tienen la barra de su navegador. */
  sinBarra?: boolean;
}) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  const barra = (
    <View style={[styles.barra, { borderBottomColor: themeColors.border }]}>
      <TouchableOpacity
        onPress={() => (router.canGoBack() ? router.back() : router.replace(volverA as any))}
        style={styles.volver}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <ArrowLeft size={24} color={themeColors.text.primary} />
      </TouchableOpacity>
      <Text style={[styles.titulo, { color: themeColors.text.primary }]} numberOfLines={1}>{titulo}</Text>
      <View style={styles.derecha}>{derecha}</View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
      {!sinBarra && barra}
      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : conScroll ? (
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefrescar ? <RefreshControl refreshing={refrescando} onRefresh={onRefrescar} /> : undefined}
        >
          {!!error && <Text style={[styles.error, { color: colors.danger[600] }]}>{error}</Text>}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.contenido}>
          {!!error && <Text style={[styles.error, { color: colors.danger[600] }]}>{error}</Text>}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  volver: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  titulo: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  derecha: { minWidth: 40, alignItems: 'flex-end' },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contenido: { padding: spacing.lg, paddingBottom: 50 },
  error: { fontSize: fontSize.sm, marginBottom: spacing.md },
});
