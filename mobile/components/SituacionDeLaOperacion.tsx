import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { fontSize, fontWeight, borderRadius, spacing } from '../constants/theme';
import type { SituacionParaLaPersona } from '../../shared/jobs/situacionParaLaPersona';

/**
 * En qué está un trabajo o un contrato, de punta a punta, dicho para quien lo mira (pedido del dueño, 2026-11-12: «todo debe estar con los mismos estados»).
 * Es el MISMO estado que ve el equipo y que muestra la web (`client/components/SituacionDeLaOperacion.tsx`); el servidor lo manda ya traducido para el rol.
 * Sin `situacion` no dibuja nada.
 */
const COLORES: Record<SituacionParaLaPersona['tono'], { fondo: string; texto: string }> = {
  atencion: { fondo: '#FEF3C7', texto: '#92400E' },
  espera: { fondo: '#FFEDD5', texto: '#9A3412' },
  bien: { fondo: '#DCFCE7', texto: '#166534' },
  info: { fondo: '#E0F2FE', texto: '#075985' },
  cierre: { fondo: '#F1F5F9', texto: '#334155' },
};

export default function SituacionDeLaOperacion({ situacion, conExplicacion = false }: { situacion?: SituacionParaLaPersona | null; conExplicacion?: boolean }) {
  const { colors: tema } = useTheme();
  if (!situacion) return null;
  const c = COLORES[situacion.tono] ?? COLORES.info;
  return (
    <View style={styles.contenedor} testID="situacion-de-la-operacion">
      <View style={[styles.pastilla, { backgroundColor: c.fondo }]}>
        <Text style={[styles.texto, { color: c.texto }]}>{situacion.etiqueta}</Text>
      </View>
      {conExplicacion && !!situacion.explicacion && <Text style={[styles.explicacion, { color: tema.text.muted }]}>{situacion.explicacion}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { alignItems: 'flex-start', marginTop: spacing.xs },
  pastilla: { borderRadius: borderRadius.full ?? 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  texto: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  explicacion: { fontSize: fontSize.xs, marginTop: 4 },
});
