import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { JOB_CATEGORIES } from '../../shared/constants/categories';

/**
 * «¿Cómo vas a usar DOAPP?» del registro (pedido del dueño, 2026-11-12): cliente, trabajador o ambos; el trabajador elige sus rubros o «cualquier rubro».
 * Igual que en la web (`client/components/perfil/SelectorDeTipoDeCuenta.tsx`).
 */
export type TipoDeCuenta = 'client' | 'worker' | 'both';

interface Props {
  tipo: TipoDeCuenta;
  onTipo: (t: TipoDeCuenta) => void;
  rubros: string[];
  cualquier: boolean;
  onRubros: (r: string[]) => void;
  onCualquier: (v: boolean) => void;
}

const OPCIONES: Array<{ id: TipoDeCuenta; titulo: string; detalle: string }> = [
  { id: 'client', titulo: 'Cliente', detalle: 'Quiero contratar' },
  { id: 'worker', titulo: 'Trabajador', detalle: 'Quiero ofrecer mis servicios' },
  { id: 'both', titulo: 'Ambos', detalle: 'Contrato y trabajo' },
];

export default function SelectorDeTipoDeCuenta({ tipo, onTipo, rubros, cualquier, onRubros, onCualquier }: Props) {
  const { colors: tema } = useTheme();
  const alternar = (id: string) => onRubros(rubros.includes(id) ? rubros.filter((r) => r !== id) : [...rubros, id]);

  return (
    <View style={styles.bloque}>
      <Text style={[styles.label, { color: tema.text.secondary }]}>¿Cómo vas a usar DOAPP?</Text>
      <View style={styles.fila} accessibilityRole="radiogroup">
        {OPCIONES.map((o) => {
          const activo = tipo === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: activo }}
              onPress={() => onTipo(o.id)}
              style={[styles.opcion, { borderColor: activo ? colors.primary[600] : tema.border, backgroundColor: activo ? colors.primary[50] : tema.card }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.titulo, { color: activo ? colors.primary[700] : tema.text.primary }]}>{o.titulo}</Text>
              <Text style={[styles.detalle, { color: activo ? colors.primary[700] : tema.text.muted }]}>{o.detalle}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tipo !== 'client' && (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: tema.text.secondary }]}>¿En qué rubros trabajás?</Text>
          <TouchableOpacity onPress={() => onCualquier(!cualquier)} style={styles.cualquier} accessibilityRole="checkbox" accessibilityState={{ checked: cualquier }}>
            <View style={[styles.casilla, { borderColor: tema.border }, cualquier && { backgroundColor: colors.primary[600], borderColor: colors.primary[600] }]}>
              {cualquier && <Text style={styles.tilde}>✓</Text>}
            </View>
            <Text style={{ color: tema.text.primary, fontSize: fontSize.sm }}>Cualquier rubro</Text>
          </TouchableOpacity>
          <View style={[styles.chips, cualquier && { opacity: 0.5 }]}>
            {JOB_CATEGORIES.map((c) => {
              const activo = rubros.includes(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  disabled={cualquier}
                  onPress={() => alternar(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  style={[styles.chip, { borderColor: activo ? colors.primary[600] : tema.border, backgroundColor: activo ? colors.primary[600] : tema.card }]}
                >
                  <Text style={{ color: activo ? '#fff' : tema.text.secondary, fontSize: fontSize.sm }}>{c.icon} {c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.ayuda, { color: tema.text.muted }]}>Los rubros ayudan a que te encuentren en las búsquedas. Podés cambiarlos desde tu perfil.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  fila: { flexDirection: 'row', gap: spacing.sm },
  opcion: { flex: 1, borderWidth: 2, borderRadius: borderRadius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, alignItems: 'center' },
  titulo: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  detalle: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  cualquier: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  casilla: { width: 20, height: 20, borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  tilde: { color: '#fff', fontSize: 12, fontWeight: fontWeight.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  ayuda: { fontSize: 12, marginTop: spacing.xs },
});
