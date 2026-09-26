import { View, Text, StyleSheet } from 'react-native';
import { ShieldOff } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { avisoSinProteccion, type Momento, type Rol } from '../../shared/pagos/modoDePago';

/**
 * El aviso de que este trabajo no tiene protección de pago.
 *
 * Mismo texto que la web, del mismo archivo: es la misma promesa dicha en dos
 * plataformas, y si cada una escribe la suya terminan diciendo cosas
 * distintas sobre quién responde si el cliente no paga.
 *
 * El tono es deliberado. No es un cartel de peligro: quien publica así suele
 * tener un motivo razonable, hay rubros donde nadie paga por adelantado. Lo
 * que no puede pasar es que el trabajador se entere después de haber
 * trabajado.
 */

export default function AvisoSinProteccion({
  momento,
  rol,
  compacto = false,
}: {
  momento: Momento;
  /**
   * Quién está mirando. El cliente y el trabajador no corren el mismo riesgo
   * ni tienen la misma responsabilidad, y un texto neutro termina siendo vago
   * para los dos. Sin rol va el neutro, que es lo correcto en una publicación
   * abierta donde no se sabe quién mira.
   */
  rol?: Rol | null;
  /** Una línea, para tarjetas donde no entra el párrafo entero. */
  compacto?: boolean;
}) {
  const aviso = avisoSinProteccion(momento, rol);

  // Del mismo lugar del que salen los demas avisos de esta pantalla
  // (colors.success para el badge de escrow, por ejemplo). `useTheme()`
  // expone `warning` como un color suelto, no como paleta.
  const fondo = colors.warning[50];
  const borde = colors.warning[100];
  const tinta = colors.warning[600];

  if (compacto) {
    return (
      <View style={[styles.chip, { backgroundColor: fondo, borderColor: borde }]}>
        <ShieldOff size={14} color={tinta} />
        <Text style={[styles.chipText, { color: tinta }]}>Se paga al terminar</Text>
      </View>
    );
  }

  return (
    <View style={[styles.caja, { backgroundColor: fondo, borderColor: borde }]}>
      <ShieldOff size={18} color={tinta} style={styles.icono} />
      <View style={styles.texto}>
        <Text style={[styles.titulo, { color: tinta }]}>{aviso.titulo}</Text>
        <Text style={[styles.cuerpo, { color: tinta }]}>{aviso.cuerpo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  icono: { marginTop: 2 },
  texto: { flex: 1 },
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: 2 },
  cuerpo: { fontSize: fontSize.sm, lineHeight: 19 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
