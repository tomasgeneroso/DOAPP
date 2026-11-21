import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21), igual que en la web: lo ve quien contrató mientras el trabajo está en marcha o esperando
 * confirmación. Pregunta qué pasó y lleva al reclamo con la categoría ya elegida; abrir un reclamo detiene la confirmación automática y lo revisa el equipo de DOAPP.
 */
export const OPCIONES_DE_PROBLEMA: Array<{ categoria: string; titulo: string; detalle: string }> = [
  { categoria: 'incomplete_work', titulo: 'El trabajo no se terminó', detalle: 'Quedó trabajo sin hacer.' },
  { categoria: 'service_not_delivered', titulo: 'No se presentó o no lo hizo', detalle: 'El trabajador no fue o no hizo el trabajo.' },
  { categoria: 'quality_issues', titulo: 'Se hizo, pero con problemas', detalle: 'El resultado no es el acordado o hay daños.' },
  { categoria: 'other', titulo: 'Hubo otro problema', detalle: 'Algo distinto a lo anterior.' },
];

export default function HuboProblemas({ contractId }: { contractId: string }) {
  const router = useRouter();
  const { colors: tema } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);

  const continuar = () => {
    if (!categoria) return;
    setAbierto(false);
    router.push({ pathname: '/disputes/create', params: { contractId, category: categoria } } as any);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.boton, { borderColor: colors.danger[300] }]}
        onPress={() => { setCategoria(null); setAbierto(true); }}
        accessibilityRole="button"
        testID="hubo-problemas"
      >
        <AlertTriangle size={16} color={colors.danger[700]} />
        <Text style={[styles.botonTexto, { color: colors.danger[700] }]}>Hubo problemas durante el trabajo</Text>
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={styles.fondo}>
          <View style={[styles.caja, { backgroundColor: tema.card }]} testID="hubo-problemas-dialogo">
            <Text style={[styles.titulo, { color: tema.text.primary }]}>¿Qué pasó?</Text>
            <Text style={[styles.parrafo, { color: tema.text.secondary }]}>
              Elegí lo que mejor lo cuenta. Se abre un reclamo: la confirmación automática se detiene y el equipo de DOAPP lo revisa. El pago queda en custodia hasta que se resuelva.
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
            <View style={styles.acciones}>
              <TouchableOpacity style={[styles.accion, { borderColor: tema.border }]} onPress={() => setAbierto(false)}>
                <Text style={{ color: tema.text.primary, fontWeight: fontWeight.semibold }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.accion, styles.accionPrincipal, !categoria && { opacity: 0.5 }]} onPress={continuar} disabled={!categoria} testID="hubo-problemas-continuar">
                <Text style={{ color: '#fff', fontWeight: fontWeight.semibold }}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: borderRadius.lg, paddingVertical: spacing.md, marginTop: spacing.md },
  botonTexto: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  caja: { borderRadius: borderRadius.xl, padding: spacing.lg },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19, marginBottom: spacing.md },
  opcion: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  opcionTitulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  opcionDetalle: { fontSize: fontSize.xs, marginTop: 2 },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  accion: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: borderRadius.lg, paddingVertical: spacing.md },
  accionPrincipal: { backgroundColor: colors.danger[600], borderColor: colors.danger[600] },
});
