import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import Pantalla from '../components/Pantalla';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

const CORREO_DE_SOPORTE = 'support@doapparg.com';

/**
 * Confirmación del pedido de borrado de datos que hace Facebook/Meta (igual que `/data-deletion` en la web). El borrado ya
 * ocurrió cuando se llega acá: se desvinculó la cuenta de Facebook. Solo se muestra el código de confirmación que viene en el
 * enlace. Pública: quien llega puede no tener sesión.
 */
export default function DataDeletionScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { colors: themeColors } = useTheme();
  const codigo = Array.isArray(code) ? code[0] : code;

  return (
    <Pantalla titulo="Eliminación de datos" volverA="/(tabs)">
      <View style={styles.centro}>
        <CheckCircle2 size={56} color={colors.success[600]} />
        <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Tu solicitud de eliminación de datos fue procesada</Text>
        <Text style={[styles.texto, { color: themeColors.text.secondary }]}>
          Desvinculamos tu cuenta de Facebook de DOAPP. Si además querés eliminar tu cuenta por completo, escribinos a{' '}
          <Text style={{ color: colors.primary[600] }} onPress={() => Linking.openURL(`mailto:${CORREO_DE_SOPORTE}`)}>{CORREO_DE_SOPORTE}</Text>.
        </Text>
        {!!codigo && (
          <View style={[styles.codigo, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.codigoEtiqueta, { color: themeColors.text.muted }]}>Código de confirmación</Text>
            <Text selectable style={[styles.codigoValor, { color: themeColors.text.primary }]}>{codigo}</Text>
          </View>
        )}
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', paddingTop: spacing['2xl'] },
  titulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, textAlign: 'center', marginTop: spacing.lg },
  texto: { fontSize: fontSize.base, lineHeight: 22, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  codigo: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center', maxWidth: '100%' },
  codigoEtiqueta: { fontSize: fontSize.xs, marginBottom: 2 },
  codigoValor: { fontSize: fontSize.sm, fontFamily: 'monospace' },
});
