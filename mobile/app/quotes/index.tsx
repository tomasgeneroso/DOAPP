import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { estaVencida, etiquetaDelEstado, leerCotizaciones, listarCotizaciones, pesos, type Cotizacion } from '../../services/cotizaciones';

/** Cotizaciones recibidas y enviadas. Se envían desde el chat con la otra persona («Cotizar» en la barra del chat). */
export default function CotizacionesScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [tipo, setTipo] = useState<'received' | 'sent'>('received');
  const [lista, setLista] = useState<Cotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async (t: 'received' | 'sent') => {
    try {
      const l = leerCotizaciones(await listarCotizaciones(t));
      if (l) {
        setLista(l);
        setError('');
      } else setError('No se pudieron cargar las cotizaciones.');
    } catch {
      setError('No se pudieron cargar las cotizaciones.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    setCargando(true);
    cargar(tipo);
  }, [tipo, cargar]);

  const colorDelEstado = (e: string) =>
    e === 'accepted' ? colors.success[700] : e === 'rejected' ? colors.danger[600] : e === 'sent' ? colors.primary[600] : themeColors.text.muted;

  return (
    <Pantalla titulo="Cotizaciones" cargando={cargando} error={error} onRefrescar={() => { setRefrescando(true); cargar(tipo); }} refrescando={refrescando}>
      <View style={styles.pestanas}>
        {([['received', 'Recibidas'], ['sent', 'Enviadas']] as const).map(([valor, texto]) => (
          <TouchableOpacity
            key={valor}
            onPress={() => setTipo(valor)}
            style={[styles.pestana, { borderColor: tipo === valor ? colors.primary[600] : themeColors.border, backgroundColor: tipo === valor ? colors.primary[50] : 'transparent' }]}
          >
            <Text style={{ color: tipo === valor ? colors.primary[700] : themeColors.text.secondary, fontWeight: fontWeight.medium }}>{texto}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {lista.length === 0 && !cargando && (
        <View style={styles.vacio}>
          <FileText size={44} color={themeColors.text.muted} />
          <Text style={[styles.vacioTexto, { color: themeColors.text.muted }]}>
            {tipo === 'received' ? 'No recibiste cotizaciones.' : 'No enviaste cotizaciones. Las enviás desde el chat con el cliente (botón «Cotizar»).'}
          </Text>
        </View>
      )}

      {lista.map((c) => {
        const otra = tipo === 'received' ? c.sender?.name : c.recipient?.name;
        const vencida = estaVencida(c);
        return (
          <TouchableOpacity
            key={c.id}
            onPress={() => router.push(`/quotes/${c.id}` as any)}
            style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          >
            <Text style={[styles.titulo, { color: themeColors.text.primary }]} numberOfLines={2}>{c.title}</Text>
            <Text style={[styles.dato, { color: themeColors.text.secondary }]}>{tipo === 'received' ? 'De' : 'Para'}: {otra || '—'}</Text>
            {!!c.job?.title && <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Trabajo: {c.job.title}</Text>}
            <View style={styles.pie}>
              <Text style={[styles.total, { color: themeColors.text.primary }]}>{pesos(c.total)}</Text>
              <Text style={{ color: colorDelEstado(c.status), fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>
                {etiquetaDelEstado(c.status)}{vencida ? ' · vencida' : ''}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  pestanas: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  pestana: { flex: 1, borderWidth: 1, borderRadius: borderRadius.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  vacio: { alignItems: 'center', gap: spacing.md, marginTop: spacing['3xl'], paddingHorizontal: spacing.lg },
  vacioTexto: { textAlign: 'center', fontSize: fontSize.base },
  tarjeta: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  dato: { fontSize: fontSize.sm, marginTop: 2 },
  pie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  total: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
});
