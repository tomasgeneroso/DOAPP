import { View, Text, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { textoParaCompartir, AVISO_COMPARTIR, type DatosParaCompartir } from '../../shared/contracts/compartir';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Espejo del componente web: arma el mensaje con quién viene, cuándo y cómo
 * está verificado, y lo manda por la hoja de compartir del sistema. No genera
 * ningún link público ni incluye datos de contacto de la otra parte.
 */
export default function CompartirContrato({ datos }: { datos: DatosParaCompartir }) {
  const compartir = async () => {
    const message = textoParaCompartir(datos);
    try {
      await Share.share({ message });
    } catch (e: any) {
      Alert.alert('No se pudo compartir', e?.message || 'Intentá de nuevo');
    }
  };

  return (
    <View style={styles.contenedor}>
      <TouchableOpacity style={styles.boton} onPress={compartir} accessibilityRole="button">
        <Share2 size={18} color={colors.slate[700]} />
        <Text style={styles.botonTexto}>Compartir con alguien de confianza</Text>
      </TouchableOpacity>
      <Text style={styles.aviso}>{AVISO_COMPARTIR}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { marginBottom: spacing.md },
  boton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.slate[300], backgroundColor: '#fff',
    borderRadius: borderRadius.lg, paddingVertical: 12, paddingHorizontal: spacing.md,
  },
  botonTexto: { color: colors.slate[700], fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  aviso: { marginTop: 6, fontSize: 11, color: colors.slate[500], lineHeight: 15 },
});
