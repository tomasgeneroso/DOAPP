import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, FileText, Briefcase, CheckCircle2, Send } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fechaDeLiquidacion, type CobroPendiente } from '../../shared/pagos/aFavorPendiente';
import { diasQueFaltan, textoDelCobro } from '../../shared/pagos/cobroEnEspera';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * «Cobros pendientes»: una tarjeta por cada importe que figura a nombre de la persona pero todavía no puede usar o retirar, con el contrato y el trabajo de los que
 * viene, para poder abrirlos. Es la misma lista que muestra la web (`GET /balance` → `cobrosPendientes`).
 *
 * Pedido del dueño (2026-11-13): cada cobro en espera de liberación dice cuántos DÍAS faltan y recuerda cuánto tarda en liberarse (mismos textos que la web, de
 * `shared/pagos/cobroEnEspera.ts`); el cobro de un trabajo ya liberado se PIDE desde la tarjeta (lo paga el equipo).
 */
export default function CobrosPendientes({ cobros, onPedirCobro }: { cobros: CobroPendiente[]; onPedirCobro?: (contractId: string) => Promise<void> }) {
  const router = useRouter();
  const { colors: tema } = useTheme();
  const [pidiendo, setPidiendo] = useState<string | null>(null);
  if (cobros.length === 0) return null;

  const pedir = async (contractId: string) => {
    if (!onPedirCobro || pidiendo) return;
    setPidiendo(contractId);
    try {
      await onPedirCobro(contractId);
    } finally {
      setPidiendo(null);
    }
  };

  return (
    <View style={styles.contenedor} testID="cobros-pendientes">
      <Text style={[styles.titulo, { color: tema.text.primary }]}>Cobros pendientes</Text>
      <Text style={[styles.ayuda, { color: tema.text.secondary }]}>
        Plata que ya te corresponde pero todavía no podés usar o retirar. Cada tarjeta dice de qué contrato viene y cuántos días faltan.
      </Text>
      {cobros.map((c) => {
        const aFavor = c.tipo === 'a_favor';
        const delTrabajo = c.tipo === 'cobro_del_trabajo';
        const texto = !aFavor ? textoDelCobro({ liberado: c.liberado === true, disponibleDesde: c.disponibleDesde, pedidoEl: c.pedidoEl }, new Date(), !delTrabajo) : null;
        const dias = diasQueFaltan(c.disponibleDesde);
        const liberado = delTrabajo && texto?.estado === 'Liberado';
        const pedido = delTrabajo && !!c.pedidoEl;
        const bien = liberado || pedido;
        const colorChip = aFavor ? '#92400e' : bien ? '#166534' : '#075985';
        const fondoChip = aFavor ? '#fef3c7' : bien ? '#dcfce7' : '#e0f2fe';
        return (
          <View key={c.id} style={[styles.tarjeta, { backgroundColor: tema.card, borderColor: tema.border }]} testID="cobro-pendiente">
            <View style={styles.fila}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.etiqueta, { color: tema.text.primary }]} numberOfLines={1}>{c.etiqueta}</Text>
                <View style={[styles.chip, { backgroundColor: fondoChip }]}>
                  {bien ? <CheckCircle2 size={12} color={colorChip} /> : <Clock size={12} color={colorChip} />}
                  <Text style={[styles.chipTexto, { color: colorChip }]}>{aFavor ? 'A favor pendiente' : texto?.estado}</Text>
                </View>
                {!aFavor && !bien && dias > 0 && (
                  <Text style={[styles.dias, { color: tema.text.secondary }]} testID="dias-que-faltan">Faltan {dias} {dias === 1 ? 'día' : 'días'}</Text>
                )}
              </View>
              <Text style={[styles.monto, { color: tema.text.primary }]}>{pesos(c.monto)}</Text>
            </View>

            <Text style={[styles.detalle, { color: tema.text.secondary }]} testID="detalle-del-cobro">
              {aFavor
                ? `Todavía no es saldo: no lo podés usar ni retirar.${c.disponibleDesde ? ` Pasa a tu saldo el ${fechaDeLiquidacion(c.disponibleDesde)}.` : ''}`
                : `${!delTrabajo ? 'Ya está en tu saldo, pero todavía no lo podés retirar. ' : ''}${texto?.detalle ?? ''}`}
            </Text>

            {c.trabajo && (
              <Text style={[styles.trabajo, { color: tema.text.primary }]} numberOfLines={1}>
                <Text style={{ color: tema.text.secondary }}>Trabajo: </Text>
                {c.trabajo.titulo}
              </Text>
            )}

            {(c.contrato || c.trabajo || (delTrabajo && texto?.puedePedir)) && (
              <View style={styles.botones}>
                {delTrabajo && texto?.puedePedir && c.contrato && onPedirCobro && (
                  <TouchableOpacity
                    style={[styles.botonPedir, pidiendo === c.contrato.id && { opacity: 0.6 }]}
                    onPress={() => void pedir(c.contrato!.id)}
                    disabled={pidiendo === c.contrato.id}
                    accessibilityRole="button"
                    testID="pedir-cobro"
                  >
                    {pidiendo === c.contrato.id ? <ActivityIndicator size="small" color="#fff" /> : <Send size={14} color="#fff" />}
                    <Text style={styles.botonPrimarioTexto}>{pidiendo === c.contrato.id ? 'Pidiendo…' : 'Pedir el cobro'}</Text>
                  </TouchableOpacity>
                )}
                {c.contrato && (
                  <TouchableOpacity style={styles.botonPrimario} onPress={() => router.push(`/contracts/${c.contrato!.id}` as never)} accessibilityRole="button">
                    <FileText size={14} color="#fff" />
                    <Text style={styles.botonPrimarioTexto}>Ver contrato</Text>
                  </TouchableOpacity>
                )}
                {c.trabajo && (
                  <TouchableOpacity style={[styles.botonSecundario, { borderColor: tema.border }]} onPress={() => router.push(`/job/${c.trabajo!.id}` as never)} accessibilityRole="button">
                    <Briefcase size={14} color={tema.text.primary} />
                    <Text style={[styles.botonSecundarioTexto, { color: tema.text.primary }]}>Ver trabajo</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { marginTop: spacing.lg },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  ayuda: { fontSize: fontSize.sm, marginTop: 4, marginBottom: spacing.md },
  tarjeta: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipTexto: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  dias: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, marginTop: 4 },
  monto: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  detalle: { fontSize: fontSize.xs, marginTop: spacing.sm },
  trabajo: { fontSize: fontSize.sm, marginTop: spacing.sm },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  botonPedir: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.md },
  botonPrimario: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0ea5e9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.md },
  botonPrimarioTexto: { color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  botonSecundario: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.md },
  botonSecundarioTexto: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
});
