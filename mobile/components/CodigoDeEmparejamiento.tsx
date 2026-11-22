import { View, Text, StyleSheet } from 'react-native';
import { Key } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * El código de emparejamiento, visible para TODAS las partes del contrato (pedido del dueño, 2026-11-22), igual que en la web. El trabajador lo muestra al llegar; quien contrató lo compara.
 * El texto se puede seleccionar para copiarlo.
 */
export default function CodigoDeEmparejamiento({ codigo, vence, rol, nombreDelTrabajador }: { codigo?: string | null; vence?: string | null; rol: 'trabajador' | 'cliente'; nombreDelTrabajador?: string }) {
  const { colors: tema } = useTheme();
  if (!codigo) return null;
  return (
    <View style={[styles.caja, { borderColor: colors.primary[300], backgroundColor: tema.card }]} testID="codigo-de-emparejamiento">
      <View style={styles.titulo}>
        <Key size={18} color={colors.primary[600]} />
        <Text style={[styles.tituloTexto, { color: tema.text.primary }]}>Código de emparejamiento{nombreDelTrabajador ? ` · ${nombreDelTrabajador}` : ''}</Text>
      </View>
      <Text style={[styles.ayuda, { color: tema.text.secondary }]}>
        {rol === 'trabajador' ? 'Mostrale este código a quien te contrató cuando llegues al lugar del trabajo.' : 'El trabajador te va a mostrar este código cuando llegue. Tiene que ser el mismo que ves acá.'}
      </Text>
      <Text selectable style={[styles.codigo, { color: colors.primary[700], borderColor: colors.primary[200] }]} testID="codigo-de-emparejamiento-valor">{codigo}</Text>
      {vence ? <Text style={[styles.ayuda, { color: tema.text.muted }]}>Vence: {new Date(vence).toLocaleString('es-AR')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 2, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tituloTexto: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  ayuda: { fontSize: fontSize.xs, lineHeight: 17 },
  codigo: { textAlign: 'center', fontSize: fontSize.xl, fontWeight: fontWeight.bold, letterSpacing: 6, borderWidth: 2, borderRadius: borderRadius.md, paddingVertical: spacing.sm },
});
