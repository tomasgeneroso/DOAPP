import { ReactNode } from 'react';
import { ScrollView, StyleProp, Text, TouchableOpacity, View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, borderRadius, fontWeight, spacing } from '../../constants/theme';

/**
 * Las pestañas de la app del celular: UN solo diseño en TODAS las pantallas, el mismo que en la web (`client/components/ui/Pestanas.tsx`). Pedido del dueño, 2026-11-17:
 * «la versión mobile debe respetar la congruencia de diseño». Antes cada pantalla armaba las suyas (barra subrayada, botones sueltos, píldoras).
 *
 * Una barra segmentada: un recuadro con las opciones adentro y la elegida resaltada en celeste. Una opción puede llevar ícono y una insignia con un número. Si no
 * entran en el ancho de la pantalla, la barra se desplaza hacia el costado. `tests/pestanasIguales.test.ts` frena que se vuelvan a armar a mano.
 */
export interface OpcionDePestana<T extends string> {
  id: T;
  texto: string;
  icono?: ReactNode;
  /** Un número o texto chico al lado del rótulo (por ejemplo, cuántos hay). */
  insignia?: string | number;
  /** Algo más al final de la opción (por ejemplo, el punto que avisa que falta completar algo). */
  extra?: ReactNode;
}

/** El espaciado de afuera que usan las pantallas (margen a los costados y aire arriba y abajo): igual en todas. */
export const MARGEN_DE_PESTANAS: ViewStyle = { marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md };

export default function Pestanas<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
  tamano = 'normal',
  estilo,
  testID,
}: {
  opciones: OpcionDePestana<T>[];
  valor: T;
  onCambiar: (id: T) => void;
  /** Para lectores de pantalla. */
  etiqueta: string;
  tamano?: 'grande' | 'normal' | 'compacto';
  /** Solo para el espaciado de afuera (márgenes). */
  estilo?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors: tema, isDarkMode } = useTheme();
  const alto = tamano === 'grande' ? 46 : tamano === 'compacto' ? 30 : 38;
  const letra = tamano === 'grande' ? 15 : tamano === 'compacto' ? 12 : 13;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={etiqueta}
      testID={testID}
      style={[styles.marco, { borderColor: tema.border, backgroundColor: tema.card }, estilo]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {opciones.map((o) => {
          const elegida = o.id === valor;
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => onCambiar(o.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: elegida }}
              testID={testID ? `${testID}-${o.id}` : undefined}
              activeOpacity={0.8}
              style={[
                styles.opcion,
                { height: alto },
                elegida && { backgroundColor: isDarkMode ? 'rgba(14,165,233,0.18)' : colors.primary[100] },
              ]}
            >
              {o.icono}
              <Text
                numberOfLines={1}
                style={{
                  fontSize: letra,
                  fontWeight: fontWeight.medium,
                  color: elegida ? (isDarkMode ? colors.primary[400] : colors.primary[700]) : tema.text.secondary,
                }}
              >
                {o.texto}
              </Text>
              {o.extra}
              {o.insignia !== undefined && o.insignia !== '' && (
                <View style={[styles.insignia, { backgroundColor: isDarkMode ? tema.border : colors.slate[200] }]}>
                  <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: isDarkMode ? tema.text.primary : colors.slate[700] }}>{o.insignia}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  marco: { borderWidth: 1, borderRadius: borderRadius.lg, padding: 6 },
  fila: { flexGrow: 1, gap: 6 },
  opcion: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 2, paddingHorizontal: spacing.md, borderRadius: borderRadius.md },
  insignia: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
});
