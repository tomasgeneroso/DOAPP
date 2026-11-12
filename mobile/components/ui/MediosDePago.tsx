import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * Medios de pago con los logos de Mercado Pago y de Binance (pedido del dueño, 2026-11-12). Cada logo va sobre una pastilla blanca: el de Mercado Pago tiene
 * letras azul oscuro y no se vería sobre el fondo oscuro.
 */
export default function MediosDePago() {
  const { colors } = useTheme();
  return (
    <View style={styles.fila} accessibilityLabel="Medios de pago">
      <Text style={[styles.titulo, { color: colors.text.muted }]}>Pagá con</Text>
      <View style={styles.pastilla}>
        <Image source={require('../../assets/images/mercadopago.png')} style={styles.mp} resizeMode="contain" accessibilityLabel="Mercado Pago" />
      </View>
      <View style={styles.pastilla}>
        <Image source={require('../../assets/images/binance.png')} style={styles.binance} resizeMode="contain" accessibilityLabel="Binance" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  titulo: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pastilla: { height: 34, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  mp: { height: 22, width: 54 },
  binance: { height: 18, width: 66 },
});
