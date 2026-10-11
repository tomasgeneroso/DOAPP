import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { iniciarPagoDelContrato } from '../services/pagos';

/**
 * Pagar la garantía de un contrato desde el celular.
 *
 * El dinero queda retenido por DOAPP (garantía) hasta que el trabajo termina y las dos partes confirman. Se paga en
 * Mercado Pago, en el navegador del teléfono; Mercado Pago vuelve a una página que lleva de regreso a la app y la app
 * confirma sola el pago (pantalla «pago en curso»). Sólo se dibuja cuando `puedePagarElContrato` lo permite.
 */
export default function PagoDelContrato({
  contractId,
  precio,
  comision,
  total,
}: {
  contractId: string;
  precio: number;
  comision: number;
  total: number;
}) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [pagando, setPagando] = useState(false);

  const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
  const verEstado = () => router.push({ pathname: '/pago-en-curso', params: { tipo: 'contrato', contractId } } as any);

  const pagar = async () => {
    if (pagando) return;
    setPagando(true);
    try {
      const r = await iniciarPagoDelContrato(contractId);
      if (!r.ok) {
        if (r.yaIniciado) {
          Alert.alert('Ya hay un pago iniciado', r.mensaje, [
            { text: 'Cerrar', style: 'cancel' },
            { text: 'Ver el estado de mi pago', onPress: verEstado },
          ]);
        } else {
          Alert.alert('No se pudo iniciar el pago', r.mensaje);
        }
        return;
      }
      try {
        await Linking.openURL(r.url);
      } catch {
        Alert.alert('No se pudo abrir Mercado Pago', 'Probá de nuevo. Si el problema sigue, escribinos desde el Centro de ayuda.');
        return;
      }
      // Mercado Pago devuelve a una página web, no a la app: la app sigue el pago por su cuenta.
      verEstado();
    } catch (e: any) {
      Alert.alert('No se pudo iniciar el pago', e?.message || 'Probá de nuevo en un momento.');
    } finally {
      setPagando(false);
    }
  };

  return (
    <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <View style={styles.titulo}>
        <ShieldCheck size={18} color={colors.primary[600]} />
        <Text style={[styles.tituloTexto, { color: themeColors.text.primary }]}>Pagar la garantía</Text>
      </View>
      <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
        El dinero queda retenido por DOAPP hasta que el trabajo termina y las dos partes confirman. Pagás una sola vez, en un pago (sin cuotas).
      </Text>

      <View style={styles.desglose}>
        <View style={styles.fila}>
          <Text style={[styles.etiqueta, { color: themeColors.text.secondary }]}>Precio del trabajo</Text>
          <Text style={[styles.valor, { color: themeColors.text.primary }]}>{pesos(precio)}</Text>
        </View>
        <View style={styles.fila}>
          <Text style={[styles.etiqueta, { color: themeColors.text.secondary }]}>Comisión de DOAPP</Text>
          <Text style={[styles.valor, { color: themeColors.text.primary }]}>{pesos(comision)}</Text>
        </View>
        <View style={[styles.fila, styles.filaTotal, { borderTopColor: themeColors.border }]}>
          <Text style={[styles.etiqueta, styles.negrita, { color: themeColors.text.primary }]}>Total a pagar</Text>
          <Text style={[styles.valor, styles.negrita, { color: themeColors.text.primary }]}>{pesos(total)}</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.boton, pagando && { opacity: 0.6 }]} onPress={pagar} disabled={pagando} accessibilityRole="button">
        {pagando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <CreditCard size={18} color="#fff" />
            <Text style={styles.botonTexto}>Pagar {pesos(total)} con Mercado Pago</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.enlace} onPress={verEstado}>
        <Text style={[styles.enlaceTexto, { color: themeColors.text.secondary }]}>Ya pagué: ver el estado de mi pago</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  tituloTexto: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19 },
  desglose: { marginTop: spacing.md, gap: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  filaTotal: { borderTopWidth: 1, paddingTop: 6, marginTop: 2 },
  etiqueta: { fontSize: fontSize.sm },
  valor: { fontSize: fontSize.sm },
  negrita: { fontWeight: fontWeight.semibold },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    height: 48,
    marginTop: spacing.md,
  },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  enlace: { alignItems: 'center', paddingTop: spacing.md },
  enlaceTexto: { fontSize: fontSize.sm },
});
