import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { aprobarPublicacion, LARGO_MINIMO_MOTIVO_PUBLICACION, listarPublicacionesPorAprobar, rechazarPublicacion } from '../../services/admin';
import PedirMotivo from '../../components/PedirMotivo';

/**
 * Publicaciones que esperan la aprobación de un administrador (las pagadas con Mercado Pago quedan «en revisión» hasta
 * que alguien las aprueba). Aprobar las abre al público; rechazar devuelve el pago como saldo y el cliente lee el motivo.
 */
export default function AdminPublicaciones() {
  const { colors: themeColors } = useTheme();
  const [trabajos, setTrabajos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<any | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r: any = await listarPublicacionesPorAprobar();
      if (r?.success) {
        setTrabajos(Array.isArray(r.data) ? r.data : []);
        setError('');
      } else {
        setError(r?.message || 'No se pudieron cargar las publicaciones.');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las publicaciones.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const aprobar = (t: any) =>
    Alert.alert('Aprobar la publicación', `${t.title}\n$${Number(t.price || 0).toLocaleString('es-AR')}\n\nQueda visible para los profesionales.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar',
        onPress: async () => {
          setTrabajando(String(t.id));
          try {
            const r: any = await aprobarPublicacion(String(t.id));
            Alert.alert(r?.success ? 'Listo' : 'No se pudo', r?.message || (r?.success ? 'Publicación aprobada.' : 'Probá de nuevo.'));
            await cargar();
          } finally {
            setTrabajando(null);
          }
        },
      },
    ]);

  const confirmarRechazo = async (motivo: string) => {
    const t = rechazando;
    if (!t) return;
    setTrabajando(String(t.id));
    try {
      const r: any = await rechazarPublicacion(String(t.id), motivo);
      setRechazando(null);
      Alert.alert(r?.success ? 'Rechazada' : 'No se pudo', r?.message || (r?.success ? 'El cliente recibe el motivo.' : 'Probá de nuevo.'));
      await cargar();
    } finally {
      setTrabajando(null);
    }
  };

  const tarjeta = ({ item }: { item: any }) => {
    const ocupado = trabajando === String(item.id);
    return (
      <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Text style={[styles.titulo, { color: themeColors.text.primary }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.monto, { color: themeColors.text.primary }]}>${Number(item.price || 0).toLocaleString('es-AR')}</Text>
        {!!item.category && <Text style={[styles.dato, { color: themeColors.text.secondary }]}>{item.category}</Text>}
        {!!(item.client?.name || item.client?.email) && (
          <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Cliente: {item.client?.name || item.client?.email}</Text>
        )}
        {!!item.summary && <Text style={[styles.dato, { color: themeColors.text.secondary }]} numberOfLines={3}>{item.summary}</Text>}
        <View style={styles.botones}>
          <TouchableOpacity disabled={ocupado} onPress={() => aprobar(item)} style={[styles.boton, { backgroundColor: colors.primary[600] }, ocupado && { opacity: 0.5 }]}>
            {ocupado ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.botonTexto}>Aprobar</Text>}
          </TouchableOpacity>
          <TouchableOpacity disabled={ocupado} onPress={() => setRechazando(item)} style={[styles.boton, { backgroundColor: colors.danger[600] }, ocupado && { opacity: 0.5 }]}>
            <Text style={styles.botonTexto}>Rechazar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
      {cargando ? (
        <ActivityIndicator style={{ marginTop: spacing['3xl'] }} color={colors.primary[600]} />
      ) : (
        <FlatList
          data={trabajos}
          keyExtractor={(t) => String(t.id)}
          renderItem={tarjeta}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
          ListHeaderComponent={error ? <Text style={{ color: colors.danger[600], marginBottom: spacing.md }}>{error}</Text> : null}
          ListEmptyComponent={!error ? <Text style={[styles.vacio, { color: themeColors.text.muted }]}>No hay publicaciones esperando aprobación.</Text> : null}
        />
      )}
      <PedirMotivo
        visible={!!rechazando}
        titulo="Rechazar la publicación"
        ayuda="El cliente lo lee en su notificación."
        minimo={LARGO_MINIMO_MOTIVO_PUBLICACION}
        etiquetaConfirmar="Rechazar"
        trabajando={!!trabajando}
        onCancelar={() => setRechazando(null)}
        onConfirmar={confirmarRechazo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  tarjeta: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  monto: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginTop: spacing.xs },
  dato: { fontSize: fontSize.sm, marginTop: 2 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  boton: { borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, height: 42, justifyContent: 'center', alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  vacio: { textAlign: 'center', marginTop: spacing['3xl'], fontSize: fontSize.base },
});
