import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, Ban } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { POLITICAS } from '../../shared/constants/policies';

/**
 * La escalera de cancelaciones, del lado de quien la ve. Espejo del
 * componente web: la marca la ve el cliente donde elige; el aviso de
 * suspensión lo ve el trabajador en vez del botón de postularse.
 */

function vigente(hasta?: string | null): Date | null {
  if (!hasta) return null;
  const d = new Date(hasta);
  return d > new Date() ? d : null;
}

function fecha(d: Date) {
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

export function CancellationMark({ until }: { until?: string | null }) {
  const hasta = vigente(until);
  if (!hasta) return null;
  return (
    <View style={styles.marca}>
      <AlertTriangle size={16} color={colors.warning[600]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.marcaTitulo}>Canceló trabajos que había aceptado</Text>
        <Text style={styles.marcaDetalle}>
          Más de una vez en los últimos {POLITICAS.CANCELACION_VENTANA_DIAS} días. La marca se retira
          sola el {fecha(hasta)}.
        </Text>
      </View>
    </View>
  );
}

export function SuspendedNotice({ until }: { until?: string | null }) {
  const hasta = vigente(until);
  if (!hasta) return null;
  return (
    <View style={styles.suspendido} accessibilityRole="alert">
      <Ban size={20} color={colors.danger[600]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.suspendidoTitulo}>No podés postularte hasta el {fecha(hasta)}</Text>
        <Text style={styles.suspendidoDetalle}>
          Es por cancelar trabajos que habías aceptado. Los contratos que ya tenés en curso siguen
          igual. Si hubo un motivo de fuerza mayor, escribile a soporte con el detalle.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marca: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[400],
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  marcaTitulo: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.warning[600],
  },
  marcaDetalle: {
    fontSize: fontSize.xs,
    color: colors.warning[600],
    marginTop: 2,
    lineHeight: 16,
  },
  suspendido: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.danger[50],
    borderColor: colors.danger[400],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  suspendidoTitulo: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.danger[700],
  },
  suspendidoDetalle: {
    fontSize: fontSize.xs,
    color: colors.danger[600],
    marginTop: 4,
    lineHeight: 16,
  },
});
