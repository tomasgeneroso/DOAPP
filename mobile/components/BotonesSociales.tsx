import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { API_URL } from '../services/api';
import { urlDeIngresoSocial, NOMBRE_DEL_PROVEEDOR, ProveedorSocial } from '../services/ingresoSocial';

/**
 * «Ingresar con Google» y «Ingresar con X». Abren el ingreso en el navegador del teléfono y, al terminar, la web abre la app
 * con un código de un solo uso (pantalla `app/auth-callback.tsx`). Van ARRIBA del formulario, como en la web.
 */
export default function BotonesSociales({ accion }: { accion: 'ingresar' | 'registrarte' }) {
  const { colors: themeColors } = useTheme();

  const abrir = async (proveedor: ProveedorSocial) => {
    try {
      await Linking.openURL(urlDeIngresoSocial(proveedor, API_URL));
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
          <View style={styles.google}>
            <Text style={styles.azul}>G</Text>
            <Text style={styles.rojo}>o</Text>
            <Text style={styles.amarillo}>o</Text>
            <Text style={styles.azul}>g</Text>
            <Text style={styles.verde}>l</Text>
            <Text style={styles.rojo}>e</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => abrir('twitter')}
          accessibilityRole="button"
          accessibilityLabel={`${accion === 'registrarte' ? 'Registrarte' : 'Ingresar'} con ${NOMBRE_DEL_PROVEEDOR.twitter}`}
          style={[styles.boton, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}
        >
          <Text style={[styles.x, { color: themeColors.text.primary }]}>𝕏</Text>
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
  google: { flexDirection: 'row' },
  azul: { color: '#4285F4', fontWeight: fontWeight.bold, fontSize: fontSize.base },
  rojo: { color: '#EA4335', fontWeight: fontWeight.bold, fontSize: fontSize.base },
  amarillo: { color: '#FBBC05', fontWeight: fontWeight.bold, fontSize: fontSize.base },
  verde: { color: '#34A853', fontWeight: fontWeight.bold, fontSize: fontSize.base },
  x: { fontSize: 20, fontWeight: fontWeight.bold },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  linea: { flex: 1, height: StyleSheet.hairlineWidth },
  divisorTexto: { fontSize: fontSize.sm },
});
