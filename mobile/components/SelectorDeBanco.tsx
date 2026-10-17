import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { BANCOS, OTRO_BANCO, bancoDelCbu, esBancoDeLaLista, esCvu } from '../../shared/constants/bancos';

/**
 * El banco o billetera se ELIGE de una lista (Mercado Pago, otras billeteras, bancos) en vez de escribirse: «MP», «mercadopago» y
 * «Mercado Pago» dejan de ser tres destinos distintos para administración. «Otro…» abre un campo de texto para lo que no está.
 * Es el mismo selector que usa la web (`client/components/ui/SelectorDeBanco.tsx`, misma lista en `shared/constants/bancos.ts`).
 */
export default function SelectorDeBanco({ value, onChange, cbu }: { value: string; onChange: (nombre: string) => void; cbu?: string }) {
  const { colors: themeColors } = useTheme();
  const enLista = esBancoDeLaLista(value);
  // Una cuenta vieja trae un nombre escrito a mano: se muestra como «Otro…» con ese texto, sin perderlo.
  const [eligioOtro, setEligioOtro] = useState(!!value && !enLista);
  const mostrarTexto = eligioOtro || (!!value && !enLista);

  const delCbu = bancoDelCbu(cbu);
  const elegido = BANCOS.find((b) => b.nombre === value);
  let aviso: string | null = null;
  if (cbu && cbu.length >= 3) {
    if (delCbu && elegido && delCbu.nombre !== elegido.nombre) {
      aviso = `El CBU parece ser de ${delCbu.nombre}, y elegiste ${elegido.nombre}. Revisá que sea el correcto.`;
    } else if (esCvu(cbu) && elegido?.tipo === 'banco') {
      aviso = 'Ese número empieza con 000: es el CVU de una billetera virtual, no el CBU de un banco.';
    }
  }

  const Chip = ({ nombre, activo, onPress }: { nombre: string; activo: boolean; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activo }}
      style={[
        styles.chip,
        { borderColor: activo ? colors.primary[500] : themeColors.border, backgroundColor: activo ? colors.primary[500] : 'transparent' },
      ]}
    >
      <Text style={{ color: activo ? '#fff' : themeColors.text.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>{nombre}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      <Text style={[styles.grupo, { color: themeColors.text.muted }]}>Billeteras virtuales</Text>
      <View style={styles.fila} accessibilityRole="radiogroup">
        {BANCOS.filter((b) => b.tipo === 'billetera').map((b) => (
          <Chip key={b.nombre} nombre={b.nombre} activo={!mostrarTexto && value === b.nombre} onPress={() => { setEligioOtro(false); onChange(b.nombre); }} />
        ))}
      </View>
      <Text style={[styles.grupo, { color: themeColors.text.muted }]}>Bancos</Text>
      <View style={styles.fila} accessibilityRole="radiogroup">
        {BANCOS.filter((b) => b.tipo === 'banco').map((b) => (
          <Chip key={b.nombre} nombre={b.nombre} activo={!mostrarTexto && value === b.nombre} onPress={() => { setEligioOtro(false); onChange(b.nombre); }} />
        ))}
        <Chip nombre="Otro…" activo={mostrarTexto} onPress={() => { setEligioOtro(true); onChange(''); }} />
      </View>
      {mostrarTexto && (
        <TextInput
          style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
          value={value}
          onChangeText={onChange}
          placeholder="Nombre del banco o billetera"
          placeholderTextColor={themeColors.text.muted}
          maxLength={80}
          accessibilityLabel="Nombre del banco o billetera"
        />
      )}
      {aviso && <Text style={styles.aviso}>{aviso}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { fontSize: fontSize.xs, marginTop: spacing.sm, marginBottom: spacing.xs },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, marginTop: spacing.sm },
  aviso: { color: '#d97706', fontSize: fontSize.xs, marginTop: spacing.xs },
});
