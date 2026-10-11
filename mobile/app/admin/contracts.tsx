import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { aprobarContrato, LARGO_MINIMO_MOTIVO, listarContratosPorAprobar, rechazarContrato } from '../../services/admin';
import PedirMotivo from '../../components/PedirMotivo';

/**
 * Contratos que esperan la aprobación de un administrador.
 *
 * Aprobar deja el contrato «listo» para que las dos partes lo acepten. Si el contrato viene de una cotización ya pagada
 * por Mercado Pago, aprobarlo también verifica ese pago y lo deja en garantía (el servidor lo hace; acá se muestra el
 * mensaje que devuelve).
 */
export default function AdminContratos() {
  const { colors: themeColors } = useTheme();
  const [contratos, setContratos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<any | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r: any = await listarContratosPorAprobar();
      if (r?.success) {
        setContratos(Array.isArray(r.data) ? r.data : []);
        setError('');
      } else {
        setError(r?.message || 'No se pudieron cargar los contratos.');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los contratos.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const nombre = (c: any, rol: 'client' | 'doer') => c?.[rol]?.name || c?.[rol]?.email || (rol === 'client' ? c?.clientId : c?.doerId) || '—';

  const aprobar = (c: any) =>
    Alert.alert('Aprobar el contrato', `${c.job?.title || 'Contrato'}\n$${Number(c.price || 0).toLocaleString('es-AR')}\n\nQueda listo para que las dos partes lo acepten.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar',
        onPress: async () => {
          setTrabajando(String(c.id));
          try {
            const r: any = await aprobarContrato(String(c.id));
            Alert.alert(r?.success ? 'Listo' : 'No se pudo', r?.message || (r?.success ? 'Contrato aprobado.' : 'Probá de nuevo.'));
            await cargar();
          } finally {
            setTrabajando(null);
          }
        },
      },
    ]);

  const confirmarRechazo = async (motivo: string) => {
    const c = rechazando;
    if (!c) return;
    setTrabajando(String(c.id));
    try {
      const r: any = await rechazarContrato(String(c.id), motivo);
      setRechazando(null);
      Alert.alert(r?.success ? 'Rechazado' : 'No se pudo', r?.message || (r?.success ? 'Las partes reciben el motivo.' : 'Probá de nuevo.'));
      await cargar();
    } finally {
      setTrabajando(null);
    }
  };

  const tarjeta = ({ item }: { item: any }) => {
    const ocupado = trabajando === String(item.id);
    return (
      <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Text style={[styles.titulo, { color: themeColors.text.primary }]} numberOfLines={2}>{item.job?.title || item.title || 'Contrato'}</Text>
        <Text style={[styles.monto, { color: themeColors.text.primary }]}>${Number(item.price || 0).toLocaleString('es-AR')}</Text>
        <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Cliente: {nombre(item, 'client')}</Text>
        <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Trabajador: {nombre(item, 'doer')}</Text>
        {!!item.payment && (
          <Text style={[styles.dato, { color: themeColors.text.secondary }]}>
            Pago asociado: {item.payment.status} (${Number(item.payment.amount || 0).toLocaleString('es-AR')})
          </Text>
        )}
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
          data={contratos}
          keyExtractor={(c) => String(c.id)}
          renderItem={tarjeta}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
          ListHeaderComponent={error ? <Text style={{ color: colors.danger[600], marginBottom: spacing.md }}>{error}</Text> : null}
          ListEmptyComponent={!error ? <Text style={[styles.vacio, { color: themeColors.text.muted }]}>No hay contratos esperando aprobación.</Text> : null}
        />
      )}
      <PedirMotivo
        visible={!!rechazando}
        titulo="Rechazar el contrato"
        ayuda="Las partes reciben este motivo."
        minimo={LARGO_MINIMO_MOTIVO}
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
