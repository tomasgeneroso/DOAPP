import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, FileText, Briefcase } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fechaDeLiquidacion, type CobroPendiente } from '../../shared/pagos/aFavorPendiente';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * «Cobros pendientes»: una tarjeta por cada importe que figura a nombre de la persona pero todavía no puede usar o retirar, con el contrato y el trabajo de los que
 * viene, para poder abrirlos. Es la misma lista que muestra la web (`GET /balance` → `cobrosPendientes`).
 */
export default function CobrosPendientes({ cobros }: { cobros: CobroPendiente[] }) {
  const router = useRouter();
  const { colors: tema } = useTheme();
  if (cobros.length === 0) return null;

  return (
    <View style={styles.contenedor} testID="cobros-pendientes">
      <Text style={[styles.titulo, { color: tema.text.primary }]}>Cobros pendientes</Text>
      <Text style={[styles.ayuda, { color: tema.text.secondary }]}>
        Plata que ya te corresponde pero todavía no podés usar o retirar. Cada tarjeta dice de qué contrato viene.
      </Text>
      {cobros.map((c) => {
        const aFavor = c.tipo === 'a_favor';
        return (
          <View key={c.id} style={[styles.tarjeta, { backgroundColor: tema.card, borderColor: tema.border }]} testID="cobro-pendiente">
            <View style={styles.fila}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.etiqueta, { color: tema.text.primary }]} numberOfLines={1}>{c.etiqueta}</Text>
                <View style={[styles.chip, { backgroundColor: aFavor ? '#fef3c7' : '#e0f2fe' }]}>
                  <Clock size={12} color={aFavor ? '#92400e' : '#075985'} />
                  <Text style={[styles.chipTexto, { color: aFavor ? '#92400e' : '#075985' }]}>{aFavor ? 'A favor pendiente' : 'En liberación'}</Text>
                </View>
              </View>
              <Text style={[styles.monto, { color: tema.text.primary }]}>{pesos(c.monto)}</Text>
            </View>

            <Text style={[styles.detalle, { color: tema.text.secondary }]}>
              {aFavor ? 'Todavía no es saldo: no lo podés usar ni retirar.' : 'Ya está en tu saldo, pero todavía no lo podés retirar.'}
              {c.disponibleDesde ? ` ${aFavor ? 'Pasa a tu saldo' : 'Lo podés retirar'} el ${fechaDeLiquidacion(c.disponibleDesde)}.` : ''}
            </Text>

            {c.trabajo && (
              <Text style={[styles.trabajo, { color: tema.text.primary }]} numberOfLines={1}>
                <Text style={{ color: tema.text.secondary }}>Trabajo: </Text>
                {c.trabajo.titulo}
              </Text>
            )}

            {(c.contrato || c.trabajo) && (
              <View style={styles.botones}>
                {c.contrato && (
                  <TouchableOpacity style={styles.botonPrimario} onPress={() => router.push(`/contracts/${c.contrato!.id}` as never)} accessibilityRole="button">
                    <FileText size={14} color="#fff" />
                    <Text style={styles.botonPrimarioTexto}>Ver contrato</Text>
                  </TouchableOpacity>
                )}
                {c.trabajo && (
                  <TouchableOpacity style={[styles.botonSecundario, { borderColor: tema.border }]} onPress={() => router.push(`/job/${c.trabajo!.id}` as never)} accessibilityRole="button">
                    <Briefcase size={14} color={tema.text.primary} />
                    <Text style={[styles.botonSecundarioTexto, { color: tema.text.primary }]}>Ver trabajo</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { marginTop: spacing.lg },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  ayuda: { fontSize: fontSize.sm, marginTop: 4, marginBottom: spacing.md },
  tarjeta: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipTexto: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  monto: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  detalle: { fontSize: fontSize.xs, marginTop: spacing.sm },
  trabajo: { fontSize: fontSize.sm, marginTop: spacing.sm },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  botonPrimario: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0ea5e9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.md },
  botonPrimarioTexto: { color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  botonSecundario: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.md },
  botonSecundarioTexto: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
});
