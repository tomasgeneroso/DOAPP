import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertCircle, ChevronRight, FileEdit } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { admiteCambios, etiquetaDelTipo, hayPendiente, leerSolicitudes, pendientesParaResponder, traerSolicitudesDelContrato, type SolicitudDeCambio } from '../services/solicitudesDeCambio';

/**
 * En el contrato: si la otra parte pidió un cambio o la cancelación y falta tu respuesta, se ve acá con un enlace a la
 * solicitud (antes solo llegaba por correo). Si no hay nada pendiente para vos, no se dibuja.
 */
export default function SolicitudesDelContrato({ contractId, userId, estado }: { contractId: string; userId: unknown; estado?: string }) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [pendientes, setPendientes] = useState<SolicitudDeCambio[]>([]);
  // null = todavía no se sabe; así no se ofrece pedir un cambio mientras no se vio si ya hay uno pendiente
  const [hayAlguna, setHayAlguna] = useState<boolean | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const lista = leerSolicitudes(await traerSolicitudesDelContrato(contractId));
        if (vigente) {
          setPendientes(pendientesParaResponder(lista, userId));
          setHayAlguna(lista ? hayPendiente(lista) : null);
        }
      } catch {
        /* sin solicitudes: no se muestra nada */
      }
    })();
    return () => { vigente = false; };
  }, [contractId, userId]);

  const puedePedir = hayAlguna === false && admiteCambios(estado);
  if (pendientes.length === 0 && !puedePedir) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {puedePedir && (
        <TouchableOpacity
          onPress={() => router.push(`/contracts/change-request/new?contractId=${contractId}&estado=${estado}` as any)}
          style={[styles.pedir, { borderColor: themeColors.border }]}
          accessibilityRole="button"
        >
          <FileEdit size={18} color={colors.primary[600]} />
          <Text style={{ color: colors.primary[700], fontWeight: fontWeight.medium }}>Pedir un cambio o cancelar el contrato</Text>
        </TouchableOpacity>
      )}
      {pendientes.map((s) => (
        <TouchableOpacity
          key={s.id}
          onPress={() => router.push(`/contracts/change-request/${s.id}` as any)}
          style={[styles.caja, { backgroundColor: colors.warning[50], borderColor: colors.warning[400] }]}
        >
          <AlertCircle size={20} color={colors.warning[600]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.titulo, { color: colors.slate[800] }]}>{s.requestedBy?.name || 'La otra parte'} pidió: {etiquetaDelTipo(s.type).toLowerCase()}</Text>
            <Text style={[styles.dato, { color: colors.slate[700] }]} numberOfLines={2}>{s.reason}</Text>
            <Text style={[styles.dato, { color: themeColors.text.muted }]}>Falta tu respuesta</Text>
          </View>
          <ChevronRight size={20} color={colors.slate[700]} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm },
  pedir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderRadius: borderRadius.lg, paddingVertical: spacing.md, marginBottom: spacing.sm },
  titulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  dato: { fontSize: fontSize.xs, marginTop: 2 },
});
