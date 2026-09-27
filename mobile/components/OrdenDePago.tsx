import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ShieldOff, ShieldCheck, ExternalLink, Upload, Clock, AlertTriangle, Check } from 'lucide-react-native';
import { get, post, upload } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import AvisoSinProteccion from './AvisoSinProteccion';

/**
 * La orden de pago de un contrato sin protección, en el teléfono.
 *
 * Existe porque sin esto el módulo era web y nada más: el cliente no podía
 * pagar desde el teléfono y el trabajador no podía generar la orden. Un modo
 * de contratación que sólo funciona en una de las dos plataformas no es un
 * modo: es una pantalla que promete algo que la mitad de los usuarios no puede
 * hacer, y el trabajador que entregó el trabajo desde el teléfono se queda sin
 * la única vía por la que DOAPP podría respaldarlo.
 *
 * Misma lógica y mismos textos que la web —salen de `shared/pagos`— porque las
 * dos plataformas tienen que decir lo mismo sobre quién responde si el cliente
 * no paga.
 *
 * Lo que no puede quedar implícito: una orden creada no es una orden pagada, y
 * una orden pagada por fuera de la app no habilita reclamo. Mientras eso no se
 * cumpla, el panel lo dice con todas las letras en vez de mostrar un tilde
 * verde que tranquilice de más.
 */

interface Desglose {
  precio: number;
  comision: number;
  iva: number;
  procesamiento: number;
  ivaProcesamiento: number;
  total: number;
  cobraElTrabajador: number;
}

interface Orden {
  id: string;
  estado: string;
  metodo: string | null;
  total: number;
  desglose: Desglose | null;
  linkDePago: string | null;
  vence: string | null;
  cubierta: boolean;
  motivoDelRechazo: string | null;
  comprobantes: Array<{ id: string; url: string; estado: string; subidoEn: string }>;
}

const pesos = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El tipo MIME a partir de la extensión, cuando el selector no lo informa. */
function mimeDesdeUri(uri: string): string {
  const ext = (uri.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}

export default function OrdenDePago({
  contractId,
  estadoDelContrato,
  esCliente,
}: {
  contractId: string;
  estadoDelContrato: string;
  esCliente: boolean;
}) {
  const { colors: themeColors } = useTheme();

  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState('escrow');
  const [orden, setOrden] = useState<Orden | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const traer = useCallback(async () => {
    try {
      const res = await get<{ paymentMode: string; orden: Orden | null }>(
        `/payment-orders/contract/${contractId}`,
      );
      if (res.success && res.data) {
        setModo(res.data.paymentMode || 'escrow');
        setOrden(res.data.orden || null);
      }
    } catch {
      // Sin respuesta el panel no se dibuja. No puede ser el motivo por el que
      // se rompe la pantalla del contrato.
    } finally {
      setCargando(false);
    }
  }, [contractId]);

  useEffect(() => {
    void traer();
  }, [traer]);

  if (cargando || modo !== 'on_completion') return null;

  const terminado = ['awaiting_confirmation', 'completed'].includes(estadoDelContrato);

  async function crear(metodo: 'mercadopago' | 'comprobante') {
    setTrabajando(true);
    try {
      const res = await post<{ linkDePago?: string }>(`/payment-orders/contract/${contractId}`, {
        metodo,
      });
      if (!res.success) {
        Alert.alert('No se pudo generar la orden', res.message || 'Intentá de nuevo.');
        return;
      }
      await traer();
      // El link se abre solo: el cliente pidió pagar, no pidió un link.
      const link = (res.data as any)?.linkDePago;
      if (metodo === 'mercadopago' && link && esCliente) {
        Linking.openURL(link).catch(() => {
          Alert.alert('No se pudo abrir el link', 'Podés copiarlo desde el botón de pagar.');
        });
      }
    } catch (e: any) {
      Alert.alert('No se pudo generar la orden', e?.message || 'Intentá de nuevo.');
    } finally {
      setTrabajando(false);
    }
  }

  async function subirComprobante() {
    if (!orden) return;

    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir el comprobante.');
      return;
    }

    const elegido = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (elegido.canceled || elegido.assets.length === 0) return;

    const a = elegido.assets[0];
    const form = new FormData();
    form.append('proof', {
      uri: a.uri,
      name: a.fileName || a.uri.split('/').pop() || 'comprobante.jpg',
      type: a.mimeType || mimeDesdeUri(a.uri),
    } as any);

    setTrabajando(true);
    try {
      const res = await upload(`/payments/${orden.id}/upload-proof`, form);
      if (!res.success) {
        Alert.alert('No se pudo subir', res.message || 'Intentá de nuevo.');
        return;
      }
      Alert.alert('Comprobante subido', 'Un administrador lo va a revisar.');
      await traer();
    } catch (e: any) {
      Alert.alert('No se pudo subir', e?.message || 'Intentá de nuevo.');
    } finally {
      setTrabajando(false);
    }
  }

  const rechazada = orden?.estado === 'rejected';

  return (
    <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <View style={styles.titulo}>
        <ShieldOff size={18} color={colors.warning[600]} />
        <Text style={[styles.tituloTexto, { color: themeColors.text.primary }]}>Pago al terminar</Text>
      </View>

      {!orden && <AvisoSinProteccion momento="contratacion" rol={esCliente ? 'cliente' : 'trabajador'} />}

      {!orden && !terminado && (
        <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
          Cuando el trabajo esté terminado, acá va a aparecer la orden de pago.
        </Text>
      )}

      {!orden && terminado && (
        <>
          <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
            El trabajo está terminado. Generá la orden para que el pago quede registrado en nuestra
            app: es la única vía por la que DOAPP puede intervenir si después hay un problema.
          </Text>
          <View style={styles.botonera}>
            <TouchableOpacity
              style={[styles.boton, styles.botonPrimario]}
              onPress={() => crear('mercadopago')}
              disabled={trabajando}
            >
              {trabajando ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ExternalLink size={15} color="#fff" />
              )}
              <Text style={styles.botonPrimarioTexto}>Generar link de pago</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.boton, styles.botonSecundario, { borderColor: themeColors.border }]}
              onPress={() => crear('comprobante')}
              disabled={trabajando}
            >
              <Upload size={15} color={themeColors.text.secondary} />
              <Text style={[styles.botonSecundarioTexto, { color: themeColors.text.secondary }]}>
                Pagar por transferencia
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {orden && (
        <>
          {/* Lo primero: si está cubierta o no. */}
          <View
            style={[
              styles.estado,
              orden.cubierta
                ? { backgroundColor: colors.success[50], borderColor: colors.success[100] }
                : { backgroundColor: colors.warning[50], borderColor: colors.warning[100] },
            ]}
          >
            {orden.cubierta ? (
              <ShieldCheck size={16} color={colors.success[600]} />
            ) : (
              <AlertTriangle size={16} color={colors.warning[600]} />
            )}
            <View style={styles.estadoTexto}>
              <Text
                style={[
                  styles.estadoTitulo,
                  { color: orden.cubierta ? colors.success[700] : colors.warning[600] },
                ]}
              >
                {orden.cubierta
                  ? 'Pago verificado por DOAPP'
                  : rechazada
                    ? 'El comprobante fue rechazado'
                    : 'Todavía sin pago verificado'}
              </Text>
              <Text
                style={[
                  styles.estadoCuerpo,
                  { color: orden.cubierta ? colors.success[700] : colors.warning[600] },
                ]}
              >
                {orden.cubierta
                  ? 'El pago pasó por la orden de nuestra app, así que esta operación incluye el servicio de mediación si hace falta.'
                  : rechazada
                    ? orden.motivoDelRechazo || 'Revisá el comprobante y volvé a subirlo.'
                    : 'Mientras el pago no se haga por esta orden y quede confirmado, DOAPP no puede intervenir en un reclamo.'}
              </Text>
            </View>
          </View>

          {orden.desglose && (
            <View style={styles.desglose}>
              {[
                ['Precio del trabajo', orden.desglose.precio],
                ['Comisión', orden.desglose.comision],
                ['Procesamiento', orden.desglose.procesamiento],
                ['IVA', orden.desglose.iva + orden.desglose.ivaProcesamiento],
              ].map(([etiqueta, monto]) => (
                <View key={etiqueta as string} style={styles.fila}>
                  <Text style={[styles.filaEtiqueta, { color: themeColors.text.secondary }]}>
                    {etiqueta}
                  </Text>
                  <Text style={[styles.filaValor, { color: themeColors.text.primary }]}>
                    {pesos(monto as number)}
                  </Text>
                </View>
              ))}
              <View style={[styles.fila, styles.filaTotal, { borderTopColor: themeColors.border }]}>
                <Text style={[styles.filaEtiqueta, styles.negrita, { color: themeColors.text.primary }]}>
                  Paga el cliente
                </Text>
                <Text style={[styles.filaValor, styles.negrita, { color: themeColors.text.primary }]}>
                  {pesos(orden.desglose.total)}
                </Text>
              </View>
              <View style={styles.fila}>
                <Text style={[styles.filaEtiqueta, { color: themeColors.text.secondary }]}>
                  Cobra el trabajador
                </Text>
                <Text style={[styles.filaValor, { color: themeColors.text.secondary }]}>
                  {pesos(orden.desglose.cobraElTrabajador)}
                </Text>
              </View>
            </View>
          )}

          {orden.vence && !orden.cubierta && (
            <View style={styles.vence}>
              <Clock size={12} color={themeColors.text.muted} />
              <Text style={[styles.venceTexto, { color: themeColors.text.muted }]}>
                Vence el {new Date(orden.vence).toLocaleDateString('es-AR')}
              </Text>
            </View>
          )}

          {/* Cómo pagarla. Sólo para el cliente: es quien paga. */}
          {esCliente && !orden.cubierta && orden.estado !== 'cancelled' && (
            <View style={styles.botonera}>
              {orden.linkDePago && (
                <TouchableOpacity
                  style={[styles.boton, styles.botonPrimario]}
                  onPress={() => Linking.openURL(orden.linkDePago!).catch(() => {})}
                >
                  <ExternalLink size={15} color="#fff" />
                  <Text style={styles.botonPrimarioTexto}>Pagar {pesos(orden.total)}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.boton, styles.botonSecundario, { borderColor: themeColors.border }]}
                onPress={subirComprobante}
                disabled={trabajando}
              >
                {trabajando ? (
                  <ActivityIndicator size="small" color={themeColors.text.secondary} />
                ) : (
                  <Upload size={15} color={themeColors.text.secondary} />
                )}
                <Text style={[styles.botonSecundarioTexto, { color: themeColors.text.secondary }]}>
                  Subir comprobante
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {orden.comprobantes.length > 0 && (
            <View style={styles.comprobantes}>
              {orden.comprobantes.map((c) => (
                <View key={c.id} style={styles.comprobante}>
                  <Check size={12} color={themeColors.text.muted} />
                  <Text style={[styles.comprobanteTexto, { color: themeColors.text.muted }]}>
                    Comprobante del {new Date(c.subidoEn).toLocaleDateString('es-AR')} —{' '}
                    {c.estado === 'pending' ? 'esperando revisión' : c.estado}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  tituloTexto: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.sm },

  botonera: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  botonPrimario: { backgroundColor: colors.primary[500] },
  botonPrimarioTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  botonSecundario: { borderWidth: 1 },
  botonSecundarioTexto: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  estado: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  estadoTexto: { flex: 1 },
  estadoTitulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  estadoCuerpo: { fontSize: fontSize.sm, lineHeight: 18, marginTop: 2 },

  desglose: { marginTop: spacing.md, gap: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  filaTotal: { borderTopWidth: 1, paddingTop: 6, marginTop: 2 },
  filaEtiqueta: { fontSize: fontSize.sm },
  filaValor: { fontSize: fontSize.sm },
  negrita: { fontWeight: fontWeight.semibold },

  vence: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  venceTexto: { fontSize: fontSize.xs },

  comprobantes: { marginTop: spacing.md, gap: 4 },
  comprobante: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  comprobanteTexto: { fontSize: fontSize.xs },
});
