import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LifeBuoy } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Escribirle a soporte sobre un contrato o un usuario: SIEMPRE se puede, sea cual sea su estado (un contrato pendiente, cancelado, rechazado, en
 * disputa o terminado; un usuario suspendido o sin verificar). Es un problema o una sugerencia; el formulario del ticket lo deja elegir.
 *
 * No es el reclamo con intervención de DOAPP (la disputa), que sí depende del estado y del pago: esto no depende de nada.
 */
export default function EscribirASoporte({
  contratoId,
  usuario,
  titulo,
}: {
  contratoId?: string | null;
  usuario?: { id?: string | null; name?: string | null } | null;
  /** Nombre del trabajo del contrato, para el asunto. */
  titulo?: string | null;
}) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const usuarioId = usuario?.id ? String(usuario.id) : null;
  if (!contratoId && !usuarioId) return null;

  const irAlFormulario = (sobre: 'contrato' | 'usuario') =>
    router.push({
      pathname: '/tickets/new',
      params: {
        sobre,
        ...(contratoId ? { contractId: String(contratoId) } : {}),
        ...(sobre === 'usuario' && usuarioId ? { userId: usuarioId } : {}),
        nombre: (sobre === 'contrato' ? titulo : usuario?.name) || '',
      },
    } as never);

  return (
    <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <View style={styles.encabezado}>
        <LifeBuoy size={18} color={themeColors.primary[600]} />
        <Text style={[styles.titulo, { color: themeColors.text.primary }]}>¿Algo no anda bien, o tenés una idea?</Text>
      </View>
      {contratoId ? (
        <TouchableOpacity onPress={() => irAlFormulario('contrato')} accessibilityRole="button" accessibilityLabel="Escribir a soporte sobre este contrato">
          <Text style={[styles.enlace, { color: themeColors.primary[600] }]}>Escribir a soporte sobre este contrato</Text>
        </TouchableOpacity>
      ) : null}
      {usuarioId ? (
        <TouchableOpacity onPress={() => irAlFormulario('usuario')} accessibilityRole="button" accessibilityLabel="Reportar a esta persona">
          <Text style={[styles.enlace, { color: themeColors.primary[600] }]}>Reportar a {usuario?.name || 'esta persona'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titulo: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  enlace: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing.xs,
  },
});
