import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { leerPedidoDeCambio, responderPedidoDeCambio, retirarPedidoDeCambio, type PedidoDeCambioEnCurso } from '../services/presupuesto';

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

/** El cambio de presupuesto en curso: la persona elegida lo acepta o no; quien publicó ve el estado y puede retirarlo. No se dibuja nada si no hay un pedido. */
export default function PedidoDeCambioDePresupuesto({ jobId, version, onChanged }: { jobId: string; version?: string; onChanged: () => void }) {
  const { colors: themeColors } = useTheme();
  const [pedido, setPedido] = useState<PedidoDeCambioEnCurso | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(async () => {
    try {
      setPedido(await leerPedidoDeCambio(jobId));
    } catch {
      /* Una lectura que falla no borra lo que ya se ve; se vuelve a leer al actualizar el trabajo. */
    }
  }, [jobId]);

  useEffect(() => {
    void leer();
  }, [leer, version]);

  if (!pedido) return null;
  const mio = pedido.soy === 'elegido' ? pedido.elegidos[0] : null;

  const hacer = async (accion: () => Promise<{ ok: boolean; mensaje: string }>) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await accion();
      Alert.alert(r.ok ? 'Listo' : 'No se pudo', r.mensaje);
      onChanged();
    } catch (e: any) {
      Alert.alert('No se pudo', e?.message || 'Revisá tu conexión y probá de nuevo.');
    } finally {
      setOcupado(false);
      await leer();
    }
  };

  return (
    <View style={[styles.caja, { borderColor: colors.warning[400], backgroundColor: colors.warning[50] }]}>
      <View style={styles.titulo}>
        <AlertCircle size={18} color={colors.warning[600]} />
        <Text style={[styles.tituloTexto, { color: colors.slate[800] }]}>{mio ? 'Te piden cambiar el presupuesto' : 'Cambio de presupuesto'}</Text>
      </View>
      <Text style={[styles.parrafo, { color: colors.slate[800] }]}>
        {mio ? 'Tu pago pasaría' : 'El presupuesto pasaría'} de {pesos(pedido.precioAnterior)} a {pesos(pedido.precioNuevo)}. Motivo: {pedido.motivo}
      </Text>
      {pedido.soy === 'cliente' &&
        pedido.elegidos.map((e) => (
          <Text key={e.trabajadorId} style={[styles.parrafo, { color: colors.slate[800] }]}>
            {e.nombre}: {e.respuesta === 'acepta' ? 'aceptó' : e.respuesta === 'rechaza' ? 'no aceptó' : 'falta que responda'}
          </Text>
        ))}
      <Text style={[styles.parrafo, { color: colors.slate[800] }]}>
        {pedido.estado === 'esperando_pago' ? 'Ya aceptaron. Cambia cuando la diferencia quede paga y aprobada.' : mio ? 'Se cambia solo si lo aceptás.' : 'Se aplica cuando acepten todas las personas elegidas.'}
      </Text>
      <View style={styles.botonera}>
        {ocupado && <ActivityIndicator color={colors.primary[600]} />}
        {mio && mio.respuesta === 'pendiente' && pedido.estado === 'esperando_respuesta' && (
          <>
            <TouchableOpacity style={styles.boton} disabled={ocupado} onPress={() => void hacer(() => responderPedidoDeCambio(jobId, true))}>
              <Text style={styles.botonTexto}>Acepto el cambio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonBorde, { borderColor: themeColors.border }]} disabled={ocupado} onPress={() => void hacer(() => responderPedidoDeCambio(jobId, false))}>
              <Text style={{ color: colors.slate[800], fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>No acepto</Text>
            </TouchableOpacity>
          </>
        )}
        {pedido.soy === 'cliente' && (
          <TouchableOpacity style={[styles.botonBorde, { borderColor: themeColors.border }]} disabled={ocupado} onPress={() => void hacer(() => retirarPedidoDeCambio(jobId))}>
            <Text style={{ color: colors.slate[800], fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Retirar el pedido</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tituloTexto: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, flex: 1 },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19 },
  botonera: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, height: 44, justifyContent: 'center', alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  botonBorde: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, height: 44, justifyContent: 'center', alignItems: 'center' },
});
