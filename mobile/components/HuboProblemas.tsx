import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, PauseCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { LARGO_MAXIMO_DEL_RELATO, LARGO_MINIMO_DEL_RELATO, OPCIONES_DE_PROBLEMA, TEXTO_DEL_PROBLEMA, tituloDeProblema } from '../../shared/tickets/problemasDelTrabajo';

/**
 * «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21), igual que en la web: lo ve quien contrató mientras el trabajo está en marcha o esperando confirmación. Cuenta qué
 * pasó y se abre un TICKET para el equipo de DOAPP: la confirmación automática se detiene y el pago queda en custodia. Desde el ticket se lleva a un reclamo o, si se arregla,
 * se sigue con el mismo trabajo y quien contrató acepta el fin del trabajo de nuevo.
 */
export { OPCIONES_DE_PROBLEMA };

export interface ProblemaAbierto {
  ticketId: string | null;
  ticketNumber: string | null;
  categoria?: string;
  esMio?: boolean;
}

export default function HuboProblemas({ contractId, problema = null }: { contractId: string; problema?: ProblemaAbierto | boolean | null }) {
  const router = useRouter();
  const { colors: tema } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relato = detalle.trim();
  const puedeEnviar = !!categoria && relato.length >= LARGO_MINIMO_DEL_RELATO && !enviando;

  // Ya hay un aviso abierto: no se ofrece otro, se muestra cuál es.
  if (problema) {
    const p = typeof problema === 'object' ? problema : null;
    return (
      <View style={[styles.ya, { borderColor: colors.warning[300], backgroundColor: colors.warning[50] }]} testID="problema-ya-avisado">
        <PauseCircle size={16} color={colors.warning[700]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.yaTexto, { color: colors.warning[800] }]}>
            Ya avisaste que hubo problemas{p?.ticketNumber ? ` (${p.ticketNumber})` : ''}. El pago no se libera hasta que se resuelva.
          </Text>
          {p?.ticketId && (
            <TouchableOpacity onPress={() => router.push(`/tickets/${p.ticketId}` as any)} accessibilityRole="link" testID="ver-ticket-del-problema">
              <Text style={[styles.yaTexto, { color: colors.warning[800], fontWeight: fontWeight.bold, textDecorationLine: 'underline' }]}>Ver el ticket</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const cerrar = () => { if (!enviando) setAbierto(false); };

  const enviar = async () => {
    if (!puedeEnviar || !categoria) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await post<{ ticket?: { id: string } }>(`/contracts/${contractId}/hubo-problemas`, { categoria, detalle: relato });
      const ticketId = res.ticket?.id || (res.code === 'PROBLEMA_YA_ABIERTO' ? res.ticketId : null);
      if (ticketId) {
        setAbierto(false);
        router.push(`/tickets/${ticketId}` as any);
        return;
      }
      setError(res.message || 'No pudimos enviar el aviso. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.boton, { borderColor: colors.danger[300] }]}
        onPress={() => { setCategoria(null); setDetalle(''); setError(null); setAbierto(true); }}
        accessibilityRole="button"
        testID="hubo-problemas"
      >
        <AlertTriangle size={16} color={colors.danger[700]} />
        <Text style={[styles.botonTexto, { color: colors.danger[700] }]}>Hubo problemas durante el trabajo</Text>
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={cerrar}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.fondo}>
            <View style={[styles.caja, { backgroundColor: tema.card }]} testID="hubo-problemas-dialogo">
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.titulo, { color: tema.text.primary }]}>¿Qué pasó?</Text>
                <Text style={[styles.parrafo, { color: tema.text.secondary }]}>
                  Contanos qué pasó y abrimos un ticket para el equipo de DOAPP. La confirmación automática se detiene y el pago queda en custodia. Después podés llevarlo a un reclamo o, si se arregla, seguir con el mismo trabajo.
                </Text>
                {OPCIONES_DE_PROBLEMA.map((o) => (
                  <TouchableOpacity
                    key={o.categoria}
                    onPress={() => setCategoria(o.categoria)}
                    style={[styles.opcion, { borderColor: categoria === o.categoria ? colors.danger[500] : tema.border, backgroundColor: categoria === o.categoria ? colors.danger[50] : 'transparent' }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: categoria === o.categoria }}
                    testID={`problema-${o.categoria}`}
                  >
                    <Text style={[styles.opcionTitulo, { color: categoria === o.categoria ? colors.danger[800] : tema.text.primary }]}>{o.titulo}</Text>
                    <Text style={[styles.opcionDetalle, { color: categoria === o.categoria ? colors.danger[700] : tema.text.secondary }]}>{o.detalle}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={[styles.etiqueta, { color: tema.text.primary }]}>Contá qué pasó{categoria ? ` (${tituloDeProblema(categoria).toLowerCase()})` : ''}</Text>
                <TextInput
                  value={detalle}
                  onChangeText={(t) => setDetalle(t.slice(0, LARGO_MAXIMO_DEL_RELATO))}
                  multiline
                  numberOfLines={4}
                  placeholder="Por ejemplo: se fue sin terminar el piso de la cocina y no volvió."
                  placeholderTextColor={tema.text.muted}
                  style={[styles.relato, { borderColor: tema.border, color: tema.text.primary, backgroundColor: tema.background }]}
                  testID="relato-del-problema"
                />
                <Text style={[styles.ayuda, { color: tema.text.muted }]}>
                  {relato.length < LARGO_MINIMO_DEL_RELATO ? `Escribí al menos ${LARGO_MINIMO_DEL_RELATO} letras para que el equipo pueda ayudar.` : `${relato.length}/${LARGO_MAXIMO_DEL_RELATO}`}
                </Text>
                {error && <Text style={styles.error} accessibilityRole="alert" testID="hubo-problemas-error">{error}</Text>}
                <View style={styles.acciones}>
                  <TouchableOpacity style={[styles.accion, { borderColor: tema.border }]} onPress={cerrar} disabled={enviando}>
                    <Text style={{ color: tema.text.primary, fontWeight: fontWeight.semibold }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.accion, styles.accionPrincipal, !puedeEnviar && { opacity: 0.5 }]} onPress={enviar} disabled={!puedeEnviar} testID="hubo-problemas-continuar">
                    {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: fontWeight.semibold }}>Enviar aviso</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

/** Lo que ve el TRABAJADOR (y quien contrató) cuando hay un aviso abierto: el pago no se libera solo hasta que el equipo lo resuelva. */
export function AvisoDeProblemaAbierto({ problema, soyQuienContrato }: { problema?: ProblemaAbierto | null; soyQuienContrato: boolean }) {
  const router = useRouter();
  if (!problema) return null;
  return (
    <View style={[styles.ya, { borderColor: colors.warning[300], backgroundColor: colors.warning[50] }]} accessibilityRole="alert" testID="aviso-de-problema-abierto">
      <PauseCircle size={18} color={colors.warning[700]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.yaTexto, { color: colors.warning[800], fontWeight: fontWeight.bold }]}>
          {soyQuienContrato ? 'Avisaste que hubo problemas' : 'Quien te contrató avisó que hubo problemas'}{problema.ticketNumber ? ` (${problema.ticketNumber})` : ''}
        </Text>
        <Text style={[styles.yaTexto, { color: colors.warning[800] }]}>
          {TEXTO_DEL_PROBLEMA.pausa} {soyQuienContrato ? 'Si se arregla, podés seguir con el mismo trabajo; si no, llevarlo a un reclamo.' : 'El equipo de DOAPP lo revisa y te avisamos cómo sigue.'}
        </Text>
        {soyQuienContrato && problema.ticketId && (
          <TouchableOpacity onPress={() => router.push(`/tickets/${problema.ticketId}` as any)} accessibilityRole="link">
            <Text style={[styles.yaTexto, { color: colors.warning[800], fontWeight: fontWeight.bold, textDecorationLine: 'underline' }]}>Ver el ticket</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: borderRadius.lg, paddingVertical: spacing.md, marginTop: spacing.md },
  botonTexto: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  ya: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md },
  yaTexto: { fontSize: fontSize.xs, lineHeight: 17 },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  caja: { borderRadius: borderRadius.xl, padding: spacing.lg, maxHeight: '92%' },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19, marginBottom: spacing.md },
  opcion: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  opcionTitulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  opcionDetalle: { fontSize: fontSize.xs, marginTop: 2 },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginTop: spacing.sm, marginBottom: spacing.xs },
  relato: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, fontSize: fontSize.sm, minHeight: 90, textAlignVertical: 'top' },
  ayuda: { fontSize: fontSize.xs, marginTop: spacing.xs },
  error: { color: colors.danger[700], backgroundColor: colors.danger[50], borderRadius: borderRadius.md, padding: spacing.md, fontSize: fontSize.sm, marginTop: spacing.md },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  accion: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: borderRadius.lg, paddingVertical: spacing.md },
  accionPrincipal: { backgroundColor: colors.danger[600], borderColor: colors.danger[600] },
});
