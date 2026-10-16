import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { ListChecks, Plus, Trash2 } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { MAXIMO_DE_TAREAS, LARGO_MAXIMO_DE_TITULO } from '../../../shared/jobs/tareasDeCreacion';
import { formatearDia } from '../../services/calendario';

/**
 * Tareas de una «entrega por tareas»: los PASOS para terminar el trabajo, cada uno con su día (DD/MM/AAAA, opcional). Son una guía para
 * quien trabaja; los requisitos de finalización son otra cosa (lo que se toma como determinante si hay un reclamo).
 */
export interface TareaEnPantalla {
  title: string;
  /** DD/MM/AAAA mientras se escribe. */
  dueDate: string;
}

const EJEMPLOS = ['Ej: Cortar el pasto', 'Ej: Regar las plantas', 'Ej: Limpiar el patio'];

export default function TareasDelTrabajo({ tareas, onChange, themeColors, error }: { tareas: TareaEnPantalla[]; onChange: (t: TareaEnPantalla[]) => void; themeColors: any; error?: string }) {
  const campo = { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary };
  const cambiar = (i: number, parte: Partial<TareaEnPantalla>) => onChange(tareas.map((t, n) => (n === i ? { ...t, ...parte } : t)));

  return (
    <View style={[styles.caja, { backgroundColor: themeColors.primary[50] }]}>
      <View style={styles.titulo}>
        <ListChecks size={16} color={themeColors.primary[700]} />
        <Text style={{ color: themeColors.primary[700], fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>Tareas: los pasos para terminar el trabajo</Text>
      </View>
      <Text style={[styles.ayuda, { color: themeColors.primary[700] }]}>
        Cada tarea puede tener su día. Por ejemplo, «Limpiar la casa» el 15/6 y «Regar las plantas» el 16/6. Son una guía para quien trabaja: lo que se toma como determinante para dar el trabajo por terminado son los requisitos, más abajo.
      </Text>

      {tareas.map((t, i) => (
        <View key={i} style={styles.fila}>
          <Text style={[styles.indice, { color: themeColors.text.muted }]}>{i + 1}.</Text>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <TextInput
              style={[styles.input, campo]}
              placeholder={EJEMPLOS[i] ?? 'Ej: Tarea'}
              placeholderTextColor={themeColors.text.muted}
              value={t.title}
              onChangeText={(v) => cambiar(i, { title: v.slice(0, LARGO_MAXIMO_DE_TITULO) })}
            />
            <TextInput
              style={[styles.input, campo, { maxWidth: 160 }]}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={themeColors.text.muted}
              value={t.dueDate}
              onChangeText={(v) => cambiar(i, { dueDate: formatearDia(v) })}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          {tareas.length > 1 && (
            <TouchableOpacity onPress={() => onChange(tareas.filter((_, n) => n !== i))} style={styles.quitar} accessibilityLabel={`Quitar la tarea ${i + 1}`}>
              <Trash2 size={16} color={colors.danger[500]} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {tareas.length < MAXIMO_DE_TAREAS && (
        <TouchableOpacity style={[styles.agregar, { borderColor: themeColors.primary[400] }]} onPress={() => onChange([...tareas, { title: '', dueDate: '' }])}>
          <Plus size={16} color={themeColors.primary[600]} />
          <Text style={{ color: themeColors.primary[600], fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Agregar tarea</Text>
        </TouchableOpacity>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ayuda: { fontSize: fontSize.xs, lineHeight: 17 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  indice: { width: 22, paddingTop: 12, fontSize: fontSize.sm },
  input: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: fontSize.sm },
  quitar: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  agregar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderStyle: 'dashed', borderRadius: borderRadius.md, paddingVertical: spacing.sm },
  error: { color: colors.danger[500], fontSize: fontSize.xs },
});
