import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { LifeBuoy } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

export const CORREO_DE_SOPORTE = 'support@doapparg.com';

/**
 * «¿Tenés problemas para ingresar / registrarte?» → contactar a soporte.
 *
 * Quien no puede entrar no tiene sesión, así que el Centro de ayuda (que pide estar logueado) no le sirve: se abre el correo de
 * soporte con el asunto ya escrito. Si el teléfono no tiene una app de correo, se muestra la dirección para copiarla.
 */
export default function ContactarSoporte({ tema }: { tema: 'ingresar' | 'registrarte' }) {
  const { colors: themeColors } = useTheme();
  const asunto = tema === 'registrarte' ? 'Problemas para registrarme en DoApp' : 'Problemas para ingresar a DoApp';

  const abrir = async () => {
    try {
      await Linking.openURL(`mailto:${CORREO_DE_SOPORTE}?subject=${encodeURIComponent(asunto)}`);
    } catch {
      Alert.alert('Contactar soporte', `Escribinos a ${CORREO_DE_SOPORTE} contando qué te pasa.`);
    }
  };

  return (
    <View style={[styles.contenedor, { borderTopColor: themeColors.border }]}>
      <Text style={[styles.texto, { color: themeColors.text.muted }]}>
        {tema === 'registrarte' ? '¿Tenés problemas para registrarte?' : '¿Tenés problemas para ingresar?'}
      </Text>
      <TouchableOpacity
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel="Contactar soporte"
        style={[styles.boton, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}
      >
        <LifeBuoy size={16} color={themeColors.primary[600]} />
        <Text style={[styles.botonTexto, { color: themeColors.primary[600] }]}>Contactar soporte</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: spacing.sm,
  },
  texto: { fontSize: fontSize.sm },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  botonTexto: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
