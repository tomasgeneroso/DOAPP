import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { PauseCircle, CheckCircle, Scale } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { TEXTO_DEL_PROBLEMA, tituloDeProblema, type ProblemaDelTrabajo } from '../../shared/tickets/problemasDelTrabajo';

/**
 * Lo que se ofrece en un ticket de «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21), igual que en la web: seguir con el mismo trabajo (el ticket queda resuelto y
 * quien contrató acepta el fin del trabajo de nuevo) o llevarlo a un reclamo, que decide el equipo de DOAPP. Mientras está abierto, el pago no se libera.
 */
export default function PanelDelProblema({ ticketId, problema, onCambio }: { ticketId: string; problema: ProblemaDelTrabajo; onCambio: () => void | Promise<void> }) {
  const router = useRouter();
  const { colors: tema } = useTheme();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!problema.abierto) return null;

  const seguir = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await post(`/tickets/${ticketId}/seguir-con-el-trabajo`, {});
      if (res.success) await onCambio();
      else setError(res.message || 'No pudimos resolver el ticket. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const pedirConfirmacion = () => {
    Alert.alert(
      '¿Seguimos con el mismo trabajo?',
      'El ticket queda resuelto y el trabajo sigue. Vas a poder aceptar el fin del trabajo de nuevo; si no lo hacés, se confirma solo a las 24 horas.',
      [
        { text: 'Todavía no', style: 'cancel' },
        { text: 'Sí, seguir', onPress: () => { void seguir(); } },
      ],
    );
  };

  const llevarAReclamo = () => router.push({ pathname: '/disputes/create', params: { contractId: problema.contractId, category: problema.categoria } } as any);

  return (
    <View style={[styles.caja, { borderColor: colors.warning[300], backgroundColor: colors.warning[50] }]} testID="panel-del-problema">
      <View style={styles.titulo}>
        <PauseCircle size={18} color={colors.warning[700]} />
        <Text style={[styles.tituloTexto, { color: colors.warning[800] }]}>Hubo problemas durante el trabajo: {tituloDeProblema(problema.categoria).toLowerCase()}</Text>
      </View>
      <Text style={[styles.texto, { color: colors.warning[800] }]}>{TEXTO_DEL_PROBLEMA.pausa}</Text>

      <View style={[styles.opcion, { backgroundColor: tema.card, borderColor: tema.border }]}>
        <Text style={[styles.opcionTitulo, { color: tema.text.primary }]}>{TEXTO_DEL_PROBLEMA.seguir}</Text>
        <Text style={[styles.opcionTexto, { color: tema.text.secondary }]}>{TEXTO_DEL_PROBLEMA.seguirAyuda}</Text>
        <TouchableOpacity
          style={[styles.boton, { backgroundColor: colors.success[600] }, (!problema.puedeSeguirConElTrabajo || enviando) && { opacity: 0.5 }]}
          onPress={pedirConfirmacion}
          disabled={!problema.puedeSeguirConElTrabajo || enviando}
          accessibilityRole="button"
          testID="seguir-con-el-mismo-trabajo"
        >
          {enviando ? <ActivityIndicator color="#fff" size="small" /> : <CheckCircle size={16} color="#fff" />}
          <Text style={styles.botonTexto}>{TEXTO_DEL_PROBLEMA.seguir}</Text>
        </TouchableOpacity>
        {!problema.puedeSeguirConElTrabajo && <Text style={[styles.opcionTexto, { color: tema.text.muted }]}>El contrato ya no está en marcha: no hay nada que retomar.</Text>}
      </View>

      <View style={[styles.opcion, { backgroundColor: tema.card, borderColor: tema.border }]}>
        <Text style={[styles.opcionTitulo, { color: tema.text.primary }]}>{TEXTO_DEL_PROBLEMA.reclamo}</Text>
        <Text style={[styles.opcionTexto, { color: tema.text.secondary }]}>{TEXTO_DEL_PROBLEMA.reclamoAyuda}</Text>
        <TouchableOpacity style={[styles.boton, { backgroundColor: colors.danger[600] }]} onPress={llevarAReclamo} accessibilityRole="button" testID="llevar-a-reclamo">
          <Scale size={16} color="#fff" />
          <Text style={styles.botonTexto}>{TEXTO_DEL_PROBLEMA.reclamo}</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error} accessibilityRole="alert" testID="panel-del-problema-error">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tituloTexto: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.bold },
  texto: { fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md },
  opcion: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  opcionTitulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  opcionTexto: { fontSize: fontSize.xs, lineHeight: 17 },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: borderRadius.lg, paddingVertical: spacing.md, marginTop: spacing.sm },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  error: { color: colors.danger[700], backgroundColor: colors.danger[50], borderRadius: borderRadius.md, padding: spacing.md, fontSize: fontSize.sm },
});
