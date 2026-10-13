import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import {
  IVA_POSIBLES,
  borradorDe,
  calcularTotales,
  corregirCotizacion,
  crearCotizacion,
  cuerpoDeLaCotizacion,
  itemVacio,
  leerCotizacion,
  pesos,
  traerCotizacion,
  validarBorrador,
  type BorradorDeCotizacion,
  type ItemEnEdicion,
} from '../../services/cotizaciones';

/**
 * Armar una cotización (o corregir una rechazada, con `?edit=<id>`). Se abre desde el chat con la otra persona:
 * `?recipientId=…&conversationId=…[&jobId=…][&apply=true]`.
 */
export default function NuevaCotizacionScreen() {
  const params = useLocalSearchParams<{ recipientId?: string; conversationId?: string; jobId?: string; apply?: string; edit?: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const edicion = params.edit ? String(params.edit) : '';

  const [titulo, setTitulo] = useState('');
  const [items, setItems] = useState<ItemEnEdicion[]>([itemVacio()]);
  const [iva, setIva] = useState(21);
  const [notas, setNotas] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [validaHasta, setValidaHasta] = useState('');
  const [cargando, setCargando] = useState(!!edicion);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!edicion) return;
    (async () => {
      try {
        const c = leerCotizacion(await traerCotizacion(edicion));
        if (c) {
          const b = borradorDe(c);
          setTitulo(b.titulo);
          setItems(b.items.length ? b.items : [itemVacio()]);
          setIva(b.tasaDeIva);
          setNotas(b.notas);
          setCondiciones(b.condicionesDePago);
          setValidaHasta(b.validaHasta);
        } else setError('No se pudo cargar la cotización.');
      } catch {
        setError('No se pudo cargar la cotización.');
      } finally {
        setCargando(false);
      }
    })();
  }, [edicion]);

  const totales = calcularTotales(items, iva);
  const cambiarItem = (i: number, cambio: Partial<ItemEnEdicion>) => setItems((prev) => prev.map((x, n) => (n === i ? { ...x, ...cambio } : x)));

  const enviar = async () => {
    setError('');
    const borrador: BorradorDeCotizacion = { titulo, items, tasaDeIva: iva, notas, condicionesDePago: condiciones, validaHasta };
    const v = validarBorrador(borrador);
    if (v.ok === false) {
      setError(v.error);
      return;
    }
    if (!edicion && !params.recipientId) {
      setError('Falta el destinatario: abrí la cotización desde el chat con la otra persona.');
      return;
    }
    const cuerpo = cuerpoDeLaCotizacion(borrador, v.items, {
      recipientId: params.recipientId ? String(params.recipientId) : undefined,
      jobId: params.jobId ? String(params.jobId) : undefined,
      conversationId: params.conversationId ? String(params.conversationId) : undefined,
      applyMode: params.apply === 'true',
    });
    setEnviando(true);
    try {
      const r = edicion ? await corregirCotizacion(edicion, cuerpo) : await crearCotizacion(cuerpo);
      if (r.ok) {
        const id = r.cotizacion?.id || edicion;
        Alert.alert('Listo', r.mensaje);
        if (id) router.replace(`/quotes/${id}` as any);
        else router.back();
      } else setError(r.mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const etiqueta = (texto: string) => <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>{texto}</Text>;
  const input = (valor: string, cambiar: (v: string) => void, opciones: { placeholder?: string; teclado?: 'numeric' | 'default'; lineas?: number } = {}) => (
    <TextInput
      value={valor}
      onChangeText={cambiar}
      placeholder={opciones.placeholder}
      placeholderTextColor={themeColors.text.muted}
      keyboardType={opciones.teclado || 'default'}
      multiline={!!opciones.lineas}
      style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }, !!opciones.lineas && { height: 22 * opciones.lineas + 24, textAlignVertical: 'top' }]}
    />
  );

  return (
    <Pantalla titulo={edicion ? 'Corregir cotización' : 'Nueva cotización'} cargando={cargando} error={error} volverA="/quotes">
      {etiqueta('Título *')}
      {input(titulo, setTitulo, { placeholder: 'Ej.: Arreglo de la cañería de la cocina' })}

      <Text style={[styles.seccion, { color: themeColors.text.primary }]}>Ítems</Text>
      {items.map((it, i) => (
        <View key={i} style={[styles.item, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
          {etiqueta(`Ítem ${i + 1}`)}
          {input(it.descripcion, (v) => cambiarItem(i, { descripcion: v }), { placeholder: 'Descripción' })}
          <View style={styles.dosColumnas}>
            <View style={{ flex: 1 }}>
              {etiqueta('Cantidad')}
              {input(it.cantidad, (v) => cambiarItem(i, { cantidad: v }), { teclado: 'numeric', placeholder: '1' })}
            </View>
            <View style={{ flex: 2 }}>
              {etiqueta('Precio unitario ($)')}
              {input(it.precio, (v) => cambiarItem(i, { precio: v }), { teclado: 'numeric', placeholder: 'Ej.: 15.000' })}
            </View>
            {items.length > 1 && (
              <TouchableOpacity onPress={() => setItems((prev) => prev.filter((_, n) => n !== i))} accessibilityLabel={`Quitar ítem ${i + 1}`} style={styles.quitar}>
                <Trash2 size={20} color={colors.danger[600]} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      <TouchableOpacity onPress={() => setItems((prev) => [...prev, itemVacio()])} style={[styles.agregar, { borderColor: themeColors.border }]}>
        <Plus size={18} color={colors.primary[600]} /><Text style={{ color: colors.primary[700], fontWeight: fontWeight.medium }}>Agregar ítem</Text>
      </TouchableOpacity>

      {etiqueta('IVA')}
      <View style={styles.chips}>
        {IVA_POSIBLES.map((t) => (
          <TouchableOpacity key={t} onPress={() => setIva(t)} accessibilityRole="radio" accessibilityState={{ selected: iva === t }}
            style={[styles.chip, { borderColor: iva === t ? colors.primary[600] : themeColors.border, backgroundColor: iva === t ? colors.primary[50] : 'transparent' }]}>
            <Text style={{ color: iva === t ? colors.primary[700] : themeColors.text.primary }}>{t}%</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.totales, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <View style={styles.filaTotal}><Text style={{ color: themeColors.text.secondary }}>Subtotal</Text><Text style={{ color: themeColors.text.primary }}>{pesos(totales.subtotal)}</Text></View>
        <View style={styles.filaTotal}><Text style={{ color: themeColors.text.secondary }}>IVA ({iva}%)</Text><Text style={{ color: themeColors.text.primary }}>{pesos(totales.iva)}</Text></View>
        <View style={styles.filaTotal}><Text style={[styles.total, { color: themeColors.text.primary }]}>Total</Text><Text style={[styles.total, { color: themeColors.text.primary }]}>{pesos(totales.total)}</Text></View>
      </View>

      {etiqueta('Condiciones de pago')}
      {input(condiciones, setCondiciones, { placeholder: 'Ej.: 50% al empezar y 50% al terminar', lineas: 2 })}
      {etiqueta('Válida hasta (AAAA-MM-DD)')}
      {input(validaHasta, setValidaHasta, { placeholder: '2026-12-31' })}
      {etiqueta('Notas')}
      {input(notas, setNotas, { placeholder: 'Algo más que tenga que saber', lineas: 3 })}

      <TouchableOpacity style={[styles.enviar, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.enviarTexto}>{edicion ? 'Volver a enviar' : 'Enviar cotización'}</Text>}
      </TouchableOpacity>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.md, marginBottom: spacing.xs },
  seccion: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginTop: spacing.xl },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.base, backgroundColor: '#fff' },
  item: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md },
  dosColumnas: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  quitar: { height: 46, justifyContent: 'center', paddingHorizontal: spacing.xs },
  agregar: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: borderRadius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  totales: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.lg, gap: 4 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { fontWeight: fontWeight.bold, fontSize: fontSize.base },
  enviar: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  enviarTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
