import { View, Text, StyleSheet } from 'react-native';
import { ShieldCheck, Clock, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { frasesDeLiquidacion, TITULO_DEL_ESTADO, type LiquidacionDelContrato } from '../../shared/pagos/liquidacion';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * «Cuándo se liquida el dinero»: qué pasa con el pago del contrato (en custodia, esperando confirmación, liberado) y desde cuándo lo puede retirar el trabajador.
 * Los datos vienen del servidor (`GET /contracts/:id` → `liquidacion`) y las frases son las mismas que muestra la web (`shared/pagos/liquidacion.ts`).
 */
export default function LiquidacionDelPago({ liquidacion, rol = 'otro' }: { liquidacion?: LiquidacionDelContrato | null; rol?: 'trabajador' | 'cliente' | 'otro' }) {
  const { colors: tema } = useTheme();
  if (!liquidacion) return null;
  const frases = frasesDeLiquidacion(liquidacion, rol);
  if (frases.length === 0) return null;
  const Icono = liquidacion.estado === 'liberado' ? CheckCircle : liquidacion.estado === 'esperando_confirmacion' ? Clock : ShieldCheck;

  return (
    <View style={[styles.caja, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]} testID="liquidacion-del-pago">
      <View style={styles.titulo}>
        <Icono size={14} color="#065f46" />
        <Text style={[styles.tituloTexto, { color: '#065f46' }]}>{TITULO_DEL_ESTADO[liquidacion.estado]}</Text>
      </View>
      {frases.map((f) => (
        <Text key={f} style={[styles.frase, { color: '#064e3b' }]}>
          {f}
        </Text>
      ))}
      {liquidacion.esEstimado && <Text style={[styles.nota, { color: tema.text.secondary }]}>Las fechas son una estimación: se confirman cuando el trabajo se da por terminado.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.md },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tituloTexto: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, flex: 1 },
  frase: { fontSize: fontSize.xs, marginTop: 4, lineHeight: 17 },
  nota: { fontSize: 11, marginTop: 6 },
});
