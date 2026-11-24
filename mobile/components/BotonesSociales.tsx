import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { API_URL } from '../services/api';
import { IconoGoogle, IconoX } from './ui/IconosDeMarca';
import { urlDeIngresoSocial, NOMBRE_DEL_PROVEEDOR, ProveedorSocial } from '../services/ingresoSocial';
import { prepararIngresoSeguro } from '../services/ingresoSeguro';

/**
 * «Ingresar con Google» y «Ingresar con X». Abren el ingreso en el navegador del teléfono y, al terminar, la web abre la app
 * con un código de un solo uso (pantalla `app/auth-callback.tsx`). Van ARRIBA del formulario, como en la web.
 */
export default function BotonesSociales({ accion }: { accion: 'ingresar' | 'registrarte' }) {
  const { colors: themeColors } = useTheme();

  const abrir = async (proveedor: ProveedorSocial) => {
    try {
      const desafio = await prepararIngresoSeguro();
      await Linking.openURL(urlDeIngresoSocial(proveedor, API_URL, desafio));
    } catch {
      Alert.alert('No se pudo abrir el navegador', `Probá de nuevo o ${accion} con tu correo.`);
    }
  };

  return (
    <View>
      <View style={styles.fila}>
        <TouchableOpacity
          onPress={() => abrir('google')}
          accessibilityRole="button"
          accessibilityLabel={`${accion === 'registrarte' ? 'Registrarte' : 'Ingresar'} con ${NOMBRE_DEL_PROVEEDOR.google}`}
          style={[styles.boton, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}
        >
          <IconoGoogle size={22} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => abrir('twitter')}
          accessibilityRole="button"
          accessibilityLabel={`${accion === 'registrarte' ? 'Registrarte' : 'Ingresar'} con ${NOMBRE_DEL_PROVEEDOR.twitter}`}
          style={[styles.boton, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}
        >
          <IconoX size={20} color={themeColors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.divisor}>
        <View style={[styles.linea, { backgroundColor: themeColors.border }]} />
        <Text style={[styles.divisorTexto, { color: themeColors.text.muted }]}>o con tu correo</Text>
        <View style={[styles.linea, { backgroundColor: themeColors.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.md },
  boton: {
    minWidth: 72,
    height: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  linea: { flex: 1, height: StyleSheet.hairlineWidth },
  divisorTexto: { fontSize: fontSize.sm },
});
