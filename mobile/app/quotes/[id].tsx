import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import PedirMotivo from '../../components/PedirMotivo';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import {
  accionesDeLaCotizacion,
  aceptarCotizacion,
  estaVencida,
  etiquetaDelEstado,
  leerCotizacion,
  pesos,
  rechazarCotizacion,
  resumenParaCompartir,
  traerCotizacion,
  type Cotizacion,
} from '../../services/cotizaciones';

/** Una cotización: sus ítems y totales, y lo que cada parte puede hacer (aceptar, rechazar con motivo, corregir). */
export default function CotizacionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const [q, setQ] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [rechazando, setRechazando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const c = leerCotizacion(await traerCotizacion(String(id)));
      if (c) {
        setQ(c);
        setError('');
      } else setError('No se encontró la cotización.');
    } catch {
      setError('No se pudo cargar la cotización.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const acciones = accionesDeLaCotizacion(q, user?.id);

  const aceptar = () =>
    Alert.alert(
      'Aceptar la cotización',
      `${q?.title}\n${pesos(q?.total)}\n\nSi está vinculada a un trabajo abierto, se crea el contrato para que administración lo revise.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            setTrabajando(true);
            try {
              const r = await aceptarCotizacion(String(id));
              Alert.alert(r.ok ? 'Listo' : 'No se pudo', r.mensaje, r.ok && r.contractId ? [{ text: 'Ver el contrato', onPress: () => router.push(`/contracts/${r.contractId}` as any) }, { text: 'Cerrar' }] : undefined);
              await cargar();
            } finally {
              setTrabajando(false);
            }
          },
        },
      ],
    );

  const confirmarRechazo = async (motivo: string) => {
    setTrabajando(true);
    try {
      const r = await rechazarCotizacion(String(id), motivo);
      setRechazando(false);
      Alert.alert(r.ok ? 'Rechazada' : 'No se pudo', r.mensaje);
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  const color = q?.status === 'accepted' ? colors.success[700] : q?.status === 'rejected' ? colors.danger[600] : colors.primary[600];

  return (
    <Pantalla
      titulo="Cotización"
      cargando={cargando}
      error={q ? undefined : error}
      volverA="/quotes"
      derecha={q ? (
        <TouchableOpacity onPress={() => Share.share({ message: resumenParaCompartir(q) })} accessibilityLabel="Compartir" style={{ padding: spacing.xs }}>
          <Share2 size={22} color={themeColors.text.primary} />
        </TouchableOpacity>
      ) : undefined}
    >
      {q && (
        <>
          <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.titulo, { color: themeColors.text.primary }]}>{q.title}</Text>
            <Text style={{ color, fontWeight: fontWeight.semibold, marginTop: 2 }}>{etiquetaDelEstado(q.status)}{estaVencida(q) ? ' · vencida' : ''}</Text>
            <Text style={[styles.dato, { color: themeColors.text.secondary }]}>De: {q.sender?.name || '—'}</Text>
            <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Para: {q.recipient?.name || '—'}</Text>
            {!!q.job?.title && <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Trabajo: {q.job.title}</Text>}
            {!!q.validUntil && <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Válida hasta: {new Date(q.validUntil).toLocaleDateString('es-AR')}</Text>}
          </View>

          <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {(q.items || []).map((i, n) => (
              <View key={n} style={[styles.item, n > 0 && { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
                <Text style={[styles.itemTexto, { color: themeColors.text.primary }]}>{i.qty} × {i.description}</Text>
                <Text style={[styles.itemMonto, { color: themeColors.text.primary }]}>{pesos(i.amount)}</Text>
              </View>
            ))}
            <View style={[styles.totales, { borderTopColor: themeColors.border }]}>
              <View style={styles.filaTotal}><Text style={{ color: themeColors.text.secondary }}>Subtotal</Text><Text style={{ color: themeColors.text.primary }}>{pesos(q.subtotal)}</Text></View>
              <View style={styles.filaTotal}><Text style={{ color: themeColors.text.secondary }}>IVA ({Number(q.taxRate) || 0}%)</Text><Text style={{ color: themeColors.text.primary }}>{pesos(q.taxAmount)}</Text></View>
              <View style={styles.filaTotal}><Text style={[styles.negrita, { color: themeColors.text.primary }]}>Total</Text><Text style={[styles.negrita, { color: themeColors.text.primary }]}>{pesos(q.total)}</Text></View>
            </View>
          </View>

          {!!q.paymentTerms && <Text style={[styles.dato, { color: themeColors.text.secondary, marginBottom: spacing.sm }]}>Condiciones de pago: {q.paymentTerms}</Text>}
          {!!q.notes && <Text style={[styles.dato, { color: themeColors.text.secondary, marginBottom: spacing.md }]}>Notas: {q.notes}</Text>}
          {q.status === 'rejected' && !!q.rejectionReason && (
            <View style={[styles.aviso, { backgroundColor: colors.danger[50], borderColor: colors.danger[500] }]}>
              <Text style={{ color: colors.danger[700], fontWeight: fontWeight.semibold }}>Motivo del rechazo</Text>
              <Text style={{ color: colors.danger[700], fontSize: fontSize.sm, marginTop: 2 }}>{q.rejectionReason}</Text>
            </View>
          )}

          {acciones.includes('aceptar') && (
            <TouchableOpacity style={[styles.boton, trabajando && { opacity: 0.6 }]} onPress={aceptar} disabled={trabajando}>
              {trabajando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Aceptar cotización</Text>}
            </TouchableOpacity>
          )}
          {acciones.includes('rechazar') && (
            <TouchableOpacity style={[styles.botonSecundario, { borderColor: colors.danger[600] }]} onPress={() => setRechazando(true)} disabled={trabajando}>
              <Text style={{ color: colors.danger[600], fontWeight: fontWeight.semibold }}>Rechazar</Text>
            </TouchableOpacity>
          )}
          {acciones.includes('corregir') && (
            <TouchableOpacity style={styles.boton} onPress={() => router.push({ pathname: '/quotes/new', params: { edit: q.id } } as any)}>
              <Text style={styles.botonTexto}>Corregir y volver a enviar</Text>
            </TouchableOpacity>
          )}

          <PedirMotivo
            visible={rechazando}
            titulo="Rechazar la cotización"
            ayuda="Quien la envió lee este motivo y puede corregirla (hasta dos veces)."
            minimo={0}
            placeholder="Motivo (opcional)"
            etiquetaConfirmar="Rechazar"
            trabajando={trabajando}
            onCancelar={() => setRechazando(false)}
            onConfirmar={confirmarRechazo}
          />
        </>
      )}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  dato: { fontSize: fontSize.sm, marginTop: 3 },
  item: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  itemTexto: { flex: 1, fontSize: fontSize.sm },
  itemMonto: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  totales: { borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.sm, gap: 4 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between' },
  negrita: { fontWeight: fontWeight.bold, fontSize: fontSize.base },
  aviso: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  botonSecundario: { borderWidth: 1, borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
});
