import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle, Clock } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Quién terminó el trabajo y quién lo aceptó (pedido del dueño, 2026-11-21), igual que en la web: «terminó» = el trabajador tocó «Completé el trabajo»; «aceptó» = quien contrató
 * aceptó el fin del trabajo. Lo ven las dos partes en el contrato.
 */
export default function EstadoDeConfirmaciones({ terminoElTrabajador, acepto }: { terminoElTrabajador: boolean; acepto: boolean }) {
  const { colors: tema } = useTheme();
  const fila = (hecho: boolean, si: string, no: string, testID: string) => (
    <View style={styles.fila} testID={testID}>
      {hecho ? <CheckCircle size={16} color={colors.success[600]} /> : <Clock size={16} color={tema.text.muted} />}
      <Text style={[styles.texto, { color: hecho ? colors.success[700] : tema.text.secondary }]}>{hecho ? si : no}</Text>
    </View>
  );
  return (
    <View style={[styles.caja, { borderColor: tema.border, backgroundColor: tema.card }]} testID="estado-de-confirmaciones">
      {fila(terminoElTrabajador, 'El trabajador terminó el trabajo', 'El trabajador todavía no terminó', 'estado-trabajador')}
      {fila(acepto, 'Quien contrató aceptó el trabajo', 'Quien contrató todavía no aceptó', 'estado-cliente')}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  texto: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
