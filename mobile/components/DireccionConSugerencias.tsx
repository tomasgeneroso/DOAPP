import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, type TextInputProps } from 'react-native';
import { MapPin, Route } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize } from '../constants/theme';
import {
  buscarCodigoPostal,
  buscarSugerencias,
  MINIMO_PARA_BUSCAR,
  type CalleSugerida,
  type SugerenciaDeDireccion,
} from '../../shared/geo/direcciones';

/**
 * «Calle y número» con sugerencias de direcciones que EXISTEN (Georef, Argentina): las calles con el rango de números que tienen,
 * y la dirección completa cuando ya hay número (avisa si ese número no existe en la calle). Al elegir una dirección completa se pide
 * el código postal de esa ubicación (`onCodigoPostal`). Escribir a mano siempre funciona. La lista va debajo del campo, en el flujo
 * de la pantalla (no flotando), para que el teclado y el scroll no la tapen.
 */
type Item = { tipo: 'direccion'; s: SugerenciaDeDireccion } | { tipo: 'calle'; c: CalleSugerida };

export default function DireccionConSugerencias({
  value,
  onChangeText,
  onSelect,
  onCodigoPostal,
  style,
  ...resto
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSelect: (s: SugerenciaDeDireccion) => void;
  onCodigoPostal?: (codigoPostal: string) => void;
} & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  const { colors: themeColors } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pista, setPista] = useState<string | null>(null);
  const saltar = useRef(false);

  useEffect(() => {
    if (saltar.current) {
      saltar.current = false;
      return;
    }
    if (value.trim().length < MINIMO_PARA_BUSCAR) {
      setItems([]);
      setSinResultados(false);
      setAviso(null);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarSugerencias(value, { signal: control.signal });
      if (control.signal.aborted) return;
      const lista: Item[] = [...r.direcciones.map((s) => ({ tipo: 'direccion' as const, s })), ...r.calles.map((c) => ({ tipo: 'calle' as const, c }))];
      setItems(lista);
      setSinResultados(lista.length === 0);
      setAviso(r.alturaInexistente ? `El número ${r.alturaInexistente.altura} no existe en esa calle: llega hasta el ${r.alturaInexistente.mayor}.` : null);
      setPista(null);
      setBuscando(false);
    }, 400);
    return () => {
      clearTimeout(espera);
      control.abort();
      setBuscando(false);
    };
  }, [value]);

  const elegir = async (i: Item) => {
    saltar.current = true;
    setItems([]);
    setSinResultados(false);
    setAviso(null);
    if (i.tipo === 'calle') {
      onSelect({ etiqueta: i.c.etiqueta, calle: i.c.calle, ciudad: i.c.ciudad, provincia: i.c.provincia });
      setPista(`Escribí el número de la casa: en esta calle existen del ${i.c.desde} al ${i.c.hasta}.`);
      return;
    }
    onSelect(i.s);
    setPista(null);
    if (onCodigoPostal && i.s.lat !== undefined && i.s.lon !== undefined) {
      // OpenStreetMap pide identificar la aplicación en cada consulta.
      const cp = await buscarCodigoPostal(i.s.lat, i.s.lon, { userAgent: 'DOAPP-app/2.0 (soporte@doapparg.com)' });
      if (cp) onCodigoPostal(cp);
    }
  };

  return (
    <View>
      <TextInput value={value} onChangeText={onChangeText} style={style} autoCorrect={false} {...resto} />
      {buscando && <ActivityIndicator size="small" color={colors.primary[600]} style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }} />}
      {pista && items.length === 0 && <Text style={{ color: colors.primary[600], fontSize: fontSize.xs, marginTop: spacing.xs }}>{pista}</Text>}
      {aviso && <Text style={{ color: '#b45309', fontSize: fontSize.xs, marginTop: spacing.xs }}>{aviso}</Text>}
      {items.length > 0 && (
        <View style={[styles.lista, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
          {items.map((i) => (
            <TouchableOpacity key={i.tipo === 'direccion' ? `d:${i.s.etiqueta}` : `c:${i.c.etiqueta}`} onPress={() => void elegir(i)} style={styles.fila} accessibilityRole="button">
              {i.tipo === 'direccion' ? <MapPin size={16} color={colors.primary[600]} /> : <Route size={16} color={themeColors.text.muted} />}
              <Text style={{ color: themeColors.text.primary, fontSize: fontSize.sm, flex: 1 }}>{i.tipo === 'direccion' ? i.s.etiqueta : i.c.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {sinResultados && !buscando && !aviso && <Text style={{ color: themeColors.text.muted, fontSize: fontSize.xs, marginTop: spacing.xs }}>Sin sugerencias: podés completar la dirección a mano.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { borderWidth: 1, borderRadius: borderRadius.md, marginTop: spacing.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
