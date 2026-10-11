import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import {
  accionesDelPago,
  aprobarPago,
  confirmacionDeAccion,
  etiquetaDelEstadoDePago,
  etiquetaDelTipoDePago,
  LARGO_MINIMO_MOTIVO,
  listarPagosPendientes,
  rechazarPago,
  tituloDelPago,
  verificarGarantia,
  type AccionDePago,
} from '../../services/admin';
import PedirMotivo from '../../components/PedirMotivo';

/**
 * Pagos que esperan a un administrador: aprobarlos, rechazarlos y, en los de contrato, verificar la garantía.
 *
 * Hoy todo pago confirmado por Mercado Pago lo confirma un administrador: este es el panel para hacerlo desde el
 * celular. El servidor revisa el rol y el estado de cada pago; acá sólo se ofrecen los botones que corresponden.
 */
export default function AdminPagos() {
  const { colors: themeColors } = useTheme();
  const [pagos, setPagos] = useState<any[]>([]);
  const [sinAccion, setSinAccion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<any | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r: any = await listarPagosPendientes();
      if (r?.success) {
        const todos: any[] = Array.isArray(r.data) ? r.data : [];
        const accionables = todos.filter((p) => accionesDelPago(p).length > 0);
        setPagos(accionables);
        setSinAccion(todos.length - accionables.length);
        setError('');
      } else {
        setError(r?.message || 'No se pudieron cargar los pagos.');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los pagos.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = (accion: AccionDePago, pago: any) => {
    if (accion === 'rechazar') {
      setRechazando(pago);
      return;
    }
    const c = confirmacionDeAccion(accion, pago);
    Alert.alert(c.titulo, c.mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: accion === 'aprobar' ? 'Aprobar' : 'Verificar garantía',
        onPress: async () => {
          setTrabajando(String(pago.id));
          try {
            const r: any = accion === 'aprobar' ? await aprobarPago(String(pago.id)) : await verificarGarantia(String(pago.id));
            Alert.alert(r?.success ? 'Listo' : 'No se pudo', r?.message || (r?.success ? 'Hecho.' : 'Probá de nuevo.'));
            await cargar();
          } finally {
            setTrabajando(null);
          }
        },
      },
    ]);
  };

  const confirmarRechazo = async (motivo: string) => {
    const pago = rechazando;
    if (!pago) return;
    setTrabajando(String(pago.id));
    try {
      const r: any = await rechazarPago(String(pago.id), motivo);
      setRechazando(null);
      Alert.alert(r?.success ? 'Rechazado' : 'No se pudo', r?.message || (r?.success ? 'El cliente recibe el motivo.' : 'Probá de nuevo.'));
      await cargar();
    } finally {
      setTrabajando(null);
    }
  };

  const etiquetas: Record<AccionDePago, string> = { aprobar: 'Aprobar', rechazar: 'Rechazar', verificar_garantia: 'Verificar garantía' };

  const tarjeta = ({ item }: { item: any }) => {
    const acciones = accionesDelPago(item);
    const ocupado = trabajando === String(item.id);
    const confirmadoPorMp = Boolean(item.mercadopagoVerifiedAt);
    return (
      <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Text style={[styles.titulo, { color: themeColors.text.primary }]} numberOfLines={2}>{tituloDelPago(item)}</Text>
        <Text style={[styles.monto, { color: themeColors.text.primary }]}>${Number(item.amount || 0).toLocaleString('es-AR')}</Text>
        <Text style={[styles.dato, { color: themeColors.text.secondary }]}>
          {etiquetaDelTipoDePago(item.paymentType)} · {etiquetaDelEstadoDePago(item.status)}
        </Text>
        {!!(item.payer?.name || item.payer?.email) && (
          <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Pagó: {item.payer?.name || item.payer?.email}</Text>
        )}
        <View style={[styles.insignia, { backgroundColor: confirmadoPorMp ? colors.success[50] : colors.warning[50] }]}>
          <Text style={{ fontSize: fontSize.xs, color: confirmadoPorMp ? colors.success[700] : colors.slate[800] }}>
            {confirmadoPorMp
              ? 'Mercado Pago lo confirmó (monto exacto, sin cuotas ni cupón)'
              : item.isMercadoPago
              ? 'De Mercado Pago, sin la confirmación automática: revisalo con cuidado'
              : 'Transferencia: revisá el comprobante en la versión web'}
          </Text>
        </View>
        <View style={styles.botones}>
          {acciones.map((accion) => (
            <TouchableOpacity
              key={accion}
              disabled={ocupado}
              onPress={() => ejecutar(accion, item)}
              style={[
                styles.boton,
                { backgroundColor: accion === 'rechazar' ? colors.danger[600] : colors.primary[600] },
                ocupado && { opacity: 0.5 },
              ]}
            >
              {ocupado ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.botonTexto}>{etiquetas[accion]}</Text>}
            </TouchableOpacity>
          ))}
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
          data={pagos}
          keyExtractor={(p) => String(p.id)}
          renderItem={tarjeta}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
          ListHeaderComponent={
            error ? <Text style={{ color: colors.danger[600], marginBottom: spacing.md }}>{error}</Text> : sinAccion > 0 ? (
              <Text style={[styles.dato, { color: themeColors.text.muted, marginBottom: spacing.md }]}>
                Hay {sinAccion} pago{sinAccion === 1 ? '' : 's'} más sin acción posible todavía (pendientes de pagar o en proceso).
              </Text>
            ) : null
          }
          ListEmptyComponent={!error ? <Text style={[styles.vacio, { color: themeColors.text.muted }]}>No hay pagos esperando a un administrador.</Text> : null}
        />
      )}
      <PedirMotivo
        visible={!!rechazando}
        titulo="Rechazar el pago"
        ayuda="El cliente recibe este motivo."
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
  insignia: { borderRadius: borderRadius.md, padding: spacing.sm, marginTop: spacing.sm },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  boton: { borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, height: 42, justifyContent: 'center', alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  vacio: { textAlign: 'center', marginTop: spacing['3xl'], fontSize: fontSize.base },
});
