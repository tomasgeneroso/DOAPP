import { View, Text, StyleSheet } from 'react-native';
import { Info } from 'lucide-react-native';
import { POLITICAS } from '../../shared/constants/policies';
import { colors, spacing, borderRadius, fontSize } from '../constants/theme';

/**
 * Recordatorio para el trabajador (pedido del dueño, 2026-11-21): al terminar tiene que tocar «Completé el trabajo»; si no lo hace y quien contrató no se opone, el contrato se
 * confirma solo a las `AUTO_CONFIRMACION_HORAS` de la hora de fin y se libera el pago (T&C 7.6). Misma frase que la web.
 */
export default function RecordatorioDeConfirmacion() {
  return (
    <View style={[styles.caja, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]} testID="recordatorio-de-confirmacion">
      <Info size={16} color={colors.primary[700]} />
      <Text style={[styles.texto, { color: colors.primary[800] }]}>
        Cuando termines tocá «Completé el trabajo». Si no lo hacés, el trabajo se confirma solo {POLITICAS.AUTO_CONFIRMACION_HORAS} horas después de la hora de fin, siempre que quien contrató no se oponga.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  texto: { flex: 1, fontSize: fontSize.xs, lineHeight: 17 },
});
