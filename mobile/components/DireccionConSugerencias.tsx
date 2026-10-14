import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, type TextInputProps } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize } from '../constants/theme';
import { buscarDirecciones, MINIMO_PARA_BUSCAR, type SugerenciaDeDireccion } from '../../shared/geo/direcciones';

/**
 * «Calle y número» con sugerencias (Georef, Argentina). Elegir una completa calle, ciudad y provincia; escribir a mano siempre
 * funciona. La lista va debajo del campo, en el flujo de la pantalla (no flotando), para que el teclado y el scroll no la tapen.
 */
export default function DireccionConSugerencias({
  value,
  onChangeText,
  onSelect,
  style,
  ...resto
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSelect: (s: SugerenciaDeDireccion) => void;
} & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  const { colors: themeColors } = useTheme();
  const [sugerencias, setSugerencias] = useState<SugerenciaDeDireccion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const saltar = useRef(false);

  useEffect(() => {
    if (saltar.current) {
      saltar.current = false;
      return;
    }
    if (value.trim().length < MINIMO_PARA_BUSCAR) {
      setSugerencias([]);
      setSinResultados(false);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarDirecciones(value, { signal: control.signal });
      if (control.signal.aborted) return;
      setSugerencias(r);
      setSinResultados(r.length === 0);
      setBuscando(false);
    }, 400);
    return () => {
      clearTimeout(espera);
      control.abort();
      setBuscando(false);
    };
  }, [value]);

  const elegir = (s: SugerenciaDeDireccion) => {
    saltar.current = true;
    onSelect(s);
    setSugerencias([]);
    setSinResultados(false);
  };

  return (
    <View>
      <TextInput value={value} onChangeText={onChangeText} style={style} autoCorrect={false} {...resto} />
      {buscando && <ActivityIndicator size="small" color={colors.primary[600]} style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }} />}
      {sugerencias.length > 0 && (
        <View style={[styles.lista, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
          {sugerencias.map((s) => (
            <TouchableOpacity key={s.etiqueta} onPress={() => elegir(s)} style={styles.fila} accessibilityRole="button">
              <MapPin size={16} color={colors.primary[600]} />
              <Text style={{ color: themeColors.text.primary, fontSize: fontSize.sm, flex: 1 }}>{s.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {sinResultados && !buscando && <Text style={{ color: themeColors.text.muted, fontSize: fontSize.xs, marginTop: spacing.xs }}>Sin sugerencias: podés completar la dirección a mano.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { borderWidth: 1, borderRadius: borderRadius.md, marginTop: spacing.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
