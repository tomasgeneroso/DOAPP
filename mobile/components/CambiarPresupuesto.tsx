import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Pencil, Clock, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import {
  cambiarPresupuesto,
  cancelarCambioDePresupuesto,
  puedeCambiarElPresupuesto,
  validarCambioDePresupuesto,
  type DesgloseDelAumento,
} from '../services/presupuesto';
import { iniciarPagoDelAumento } from '../services/pagos';

/**
 * Cambiar el presupuesto de un trabajo publicado, y seguir un aumento a medias.
 *
 * Subir el precio obliga a pagar la diferencia por Mercado Pago; el pago queda en revisión de un administrador y, si en
 * 24 horas nadie lo revisa, se aprueba solo siempre que Mercado Pago lo haya confirmado bien. Mientras tanto el trabajo
 * sigue pausado con el precio anterior. Bajar el precio se acredita al saldo.
 */
export default function CambiarPresupuesto({
  job,
  esDueno,
  onChanged,
}: {
  job: any;
  esDueno: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [precio, setPrecio] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  if (!esDueno || !job) return null;
  const id = String(job.id || job._id);
  const pesos = (n: unknown) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
  const pendiente = job.aumentoPendiente as
    | { estado: 'sin_pagar' | 'pagado_en_revision'; precioNuevo: number; montoAPagar: number; horasDeEspera: number }
    | undefined;

  const verEstado = (preferenceId?: string) =>
    router.push({ pathname: '/pago-en-curso', params: { tipo: 'aumento', jobId: id, ...(preferenceId ? { preferenceId } : {}) } } as any);

  /** Abre Mercado Pago para pagar el aumento ya pedido y sigue el pago dentro de la app. */
  const pagarAhora = async () => {
    if (trabajando) return;
    setTrabajando(true);
    try {
      const r = await iniciarPagoDelAumento(id);
      if (!r.ok) {
        if (r.yaPagado) {
          Alert.alert('Ya pagaste este aumento', r.mensaje, [{ text: 'Ver el estado de mi pago', onPress: () => verEstado() }, { text: 'Cerrar', style: 'cancel' }]);
          onChanged();
        } else {
          Alert.alert('No se pudo iniciar el pago', r.mensaje);
        }
        return;
      }
      try {
        await Linking.openURL(r.url);
      } catch {
        Alert.alert('No se pudo abrir Mercado Pago', 'Probá de nuevo. Si el problema sigue, escribinos desde el Centro de ayuda.');
        return;
      }
      verEstado(r.preferenceId);
    } catch (e: any) {
      Alert.alert('No se pudo iniciar el pago', e?.message || 'Probá de nuevo en un momento.');
    } finally {
      setTrabajando(false);
    }
  };

  const cancelarElCambio = () =>
    Alert.alert('Cancelar el cambio de presupuesto', 'El trabajo vuelve a su estado y precio anteriores. Todavía no pagaste nada.', [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Cancelar el cambio',
        style: 'destructive',
        onPress: async () => {
          setTrabajando(true);
          try {
            const r = await cancelarCambioDePresupuesto(id);
            Alert.alert(r.ok ? 'Listo' : 'No se pudo cancelar', r.mensaje);
            onChanged();
          } finally {
            setTrabajando(false);
          }
        },
      },
    ]);

  const avisarQueHayQuePagar = (aPagar: number, desglose: DesgloseDelAumento) => {
    const detalle = [
      desglose.priceDifference ? `Diferencia: ${pesos(desglose.priceDifference)}` : null,
      desglose.commission ? `Comisión: ${pesos(desglose.commission)}` : null,
      desglose.processingCharge ? `Costo de procesamiento: ${pesos(desglose.processingCharge)}` : null,
      desglose.vat ? `IVA: ${pesos(desglose.vat)}` : null,
      desglose.balanceToUse ? `Se usan de tu saldo a favor: ${pesos(desglose.balanceToUse)}` : null,
    ].filter(Boolean);
    Alert.alert(
      `Para subir el precio a ${pesos(desglose.newPrice)}`,
      `${detalle.join('\n')}${detalle.length ? '\n\n' : ''}Total a pagar por Mercado Pago: ${pesos(aPagar)}\n\n` +
        'El trabajo queda pausado hasta que se apruebe el aumento.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Pagar con Mercado Pago', onPress: pagarAhora },
      ],
    );
  };

  const enviar = async () => {
    const v = validarCambioDePresupuesto(precio, motivo, Number(job.price));
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError('');
    setEnviando(true);
    try {
      const r = await cambiarPresupuesto(id, v.precio, v.motivo);
      if (r.tipo === 'requierePago') {
        setAbierto(false);
        setPrecio('');
        setMotivo('');
        onChanged(); // el trabajo ya quedó pausado con el aumento pendiente: la pantalla lo muestra
        avisarQueHayQuePagar(r.aPagar, r.desglose);
      } else if (r.tipo === 'aplicado') {
        setAbierto(false);
        setPrecio('');
        setMotivo('');
        Alert.alert('Listo', r.mensaje);
        onChanged();
      } else {
        setError(r.mensaje);
        if (r.tipo === 'aumentoEnRevision') onChanged();
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo cambiar el presupuesto. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {pendiente?.estado === 'sin_pagar' && (
        <View style={[styles.caja, { borderColor: colors.warning[400], backgroundColor: colors.warning[50] }]}>
          <View style={styles.titulo}>
            <AlertCircle size={18} color={colors.warning[600]} />
            <Text style={[styles.tituloTexto, { color: colors.slate[800] }]}>Falta pagar el aumento</Text>
          </View>
          <Text style={[styles.parrafo, { color: colors.slate[800] }]}>
            El precio nuevo es {pesos(pendiente.precioNuevo)}. Para aplicarlo pagás {pesos(pendiente.montoAPagar)}. Mientras tanto el trabajo está pausado.
          </Text>
          <View style={styles.botonera}>
            <TouchableOpacity style={[styles.boton, trabajando && { opacity: 0.6 }]} onPress={pagarAhora} disabled={trabajando}>
              {trabajando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Pagar ahora</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonBorde, { borderColor: themeColors.border }]} onPress={cancelarElCambio} disabled={trabajando}>
              <Text style={{ color: themeColors.text.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Cancelar el cambio</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {pendiente?.estado === 'pagado_en_revision' && (
        <View style={[styles.caja, { borderColor: colors.primary[200], backgroundColor: colors.primary[50] }]}>
          <View style={styles.titulo}>
            <Clock size={18} color={colors.primary[700]} />
            <Text style={[styles.tituloTexto, { color: colors.primary[800] }]}>Pagaste el aumento: está en revisión</Text>
          </View>
          <Text style={[styles.parrafo, { color: colors.primary[800] }]}>
            Un administrador lo revisa; si no lo revisa en {pendiente.horasDeEspera} horas, se aprueba solo porque tu pago ya está confirmado. El trabajo sigue pausado con el precio anterior y no hace falta que pagues de nuevo.
          </Text>
          <TouchableOpacity style={[styles.botonBorde, { borderColor: colors.primary[300], marginTop: spacing.md }]} onPress={() => verEstado()}>
            <Text style={{ color: colors.primary[800], fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Ver el estado de mi pago</Text>
          </TouchableOpacity>
        </View>
      )}

      {puedeCambiarElPresupuesto(job, esDueno) && (
        <TouchableOpacity
          style={[styles.accion, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => { setError(''); setAbierto(true); }}
        >
          <Pencil size={18} color={colors.primary[600]} />
          <Text style={[styles.accionTexto, { color: themeColors.text.primary }]}>Cambiar el presupuesto</Text>
        </TouchableOpacity>
      )}

      <Modal visible={abierto} animationType="slide" transparent onRequestClose={() => setAbierto(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fondo}>
          <View style={[styles.hoja, { backgroundColor: themeColors.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.hojaTitulo, { color: themeColors.text.primary }]}>Cambiar el presupuesto</Text>
              <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
                Precio actual: {pesos(job.price)}. Si lo subís, pagás la diferencia (más comisión, costo de procesamiento e IVA); si lo bajás, la diferencia vuelve a tu favor (a tu saldo cuando Mercado Pago libera el pago original; hasta entonces figura como «a favor pendiente»).
              </Text>

              <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>Nuevo presupuesto ($)</Text>
              <TextInput
                value={precio}
                onChangeText={setPrecio}
                keyboardType="numeric"
                placeholder="Ej.: 15.000"
                placeholderTextColor={themeColors.text.muted}
                style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
              />

              <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>Motivo (mínimo 10 caracteres)</Text>
              <TextInput
                value={motivo}
                onChangeText={setMotivo}
                multiline
                placeholder="Contá por qué cambia el presupuesto"
                placeholderTextColor={themeColors.text.muted}
                style={[styles.input, styles.inputGrande, { color: themeColors.text.primary, borderColor: themeColors.border }]}
              />

              {!!error && <Text style={{ color: colors.danger[600], fontSize: fontSize.sm, marginTop: spacing.sm }}>{error}</Text>}

              <View style={styles.botonera}>
                <TouchableOpacity style={[styles.boton, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
                  {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Continuar</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.botonBorde, { borderColor: themeColors.border }]} onPress={() => setAbierto(false)} disabled={enviando}>
                  <Text style={{ color: themeColors.text.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  tituloTexto: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, flex: 1 },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19 },
  botonera: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, height: 44, justifyContent: 'center', alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  botonBorde: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, height: 44, justifyContent: 'center', alignItems: 'center' },
  accion: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  accionTexto: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  hoja: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.lg, maxHeight: '90%' },
  hojaTitulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.base },
  inputGrande: { height: 90, paddingTop: spacing.sm, textAlignVertical: 'top' },
});
