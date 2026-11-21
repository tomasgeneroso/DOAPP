import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ShieldCheck, Clock, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { frasesDeLiquidacion, TITULO_DEL_ESTADO, type LiquidacionDelContrato } from '../../shared/pagos/liquidacion';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * «Cuándo se liquida el dinero»: qué pasa con el pago del contrato (en custodia, esperando confirmación, liberado) y desde cuándo lo puede retirar el trabajador.
 * Los datos vienen del servidor (`GET /contracts/:id` → `liquidacion`) y las frases son las mismas que muestra la web (`shared/pagos/liquidacion.ts`).
 * Plegable (pedido del dueño, 2026-11-21, igual que en la web): el título dice en qué está el dinero y las frases se abren con un toque.
 */
export default function LiquidacionDelPago({ liquidacion, rol = 'otro' }: { liquidacion?: LiquidacionDelContrato | null; rol?: 'trabajador' | 'cliente' | 'otro' }) {
  const { colors: tema } = useTheme();
  const [abierto, setAbierto] = useState(false);
  if (!liquidacion) return null;
  const frases = frasesDeLiquidacion(liquidacion, rol);
  if (frases.length === 0) return null;
  const Icono = liquidacion.estado === 'liberado' ? CheckCircle : liquidacion.estado === 'esperando_confirmacion' ? Clock : ShieldCheck;
  const Flecha = abierto ? ChevronUp : ChevronDown;

  return (
    <View style={[styles.caja, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]} testID="liquidacion-del-pago">
      <TouchableOpacity
        style={styles.titulo}
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        testID="liquidacion-del-pago-titulo"
      >
        <Icono size={14} color="#065f46" />
        <Text style={[styles.tituloTexto, { color: '#065f46' }]}>{TITULO_DEL_ESTADO[liquidacion.estado]}</Text>
        <Flecha size={16} color="#065f46" />
      </TouchableOpacity>
      {abierto && (
        <View testID="liquidacion-del-pago-detalle">
          {frases.map((f) => (
            <Text key={f} style={[styles.frase, { color: '#064e3b' }]}>
              {f}
            </Text>
          ))}
          {liquidacion.esEstimado && <Text style={[styles.nota, { color: tema.text.secondary }]}>Las fechas son una estimación: se confirman cuando el trabajo se da por terminado.</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.md },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tituloTexto: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, flex: 1 },
  frase: { fontSize: fontSize.xs, marginTop: 6, lineHeight: 17 },
  nota: { fontSize: 11, marginTop: 6 },
});
