import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Linking } from 'react-native';
import { Siren, Phone, X } from 'lucide-react-native';
import { post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Botón de emergencia del contrato en curso. Espejo del componente web:
 * registra hora y ubicación, avisa a los admins con máxima prioridad, y abre
 * el marcador con el 911. La llamada la hace la persona. Herramienta de ayuda,
 * no servicio de seguridad (T&C 11.3).
 *
 * Sin expo-location instalado se manda sin GPS: la emergencia no espera a que
 * se agregue una dependencia. La dirección del trabajo ya va del lado del
 * servidor.
 */
export default function EmergencyButton({ contractId }: { contractId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activar = async () => {
    setEnviando(true);
    setError(null);
    const res = await post<{ telefonoEmergencias?: string }>(`/contracts/${contractId}/emergencia`, {});
    if (res.success) {
      setListo((res as any).telefonoEmergencias || (res as any).data?.telefonoEmergencias || '911');
    } else {
      // Aunque falle el aviso, el 911 tiene que quedar a un toque.
      setError(res.message || 'No se pudo avisar al equipo');
      setListo('911');
    }
    setEnviando(false);
  };

  const llamar = (n: string) => Linking.openURL(`tel:${n}`).catch(() => {});

  return (
    <>
      <TouchableOpacity style={styles.boton} onPress={() => setAbierto(true)} accessibilityRole="button">
        <Siren size={20} color={colors.danger[700]} />
        <Text style={styles.botonTexto}>Botón de emergencia</Text>
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => { setAbierto(false); setListo(null); }}>
        <View style={styles.fondo}>
          <View style={styles.tarjeta}>
            <View style={styles.cabecera}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Siren size={20} color={colors.danger[600]} />
                <Text style={styles.titulo}>{listo ? 'Avisamos al equipo' : '¿Estás en una emergencia?'}</Text>
              </View>
              <TouchableOpacity onPress={() => { setAbierto(false); setListo(null); }} accessibilityLabel="Cerrar">
                <X size={22} color={colors.slate[400]} />
              </TouchableOpacity>
            </View>

            {!listo ? (
              <>
                <Text style={styles.cuerpo}>
                  Al confirmar, DOAPP registra la hora, avisa al equipo con máxima prioridad y te acerca el 911.
                  La llamada la hacés vos: esto es una herramienta de ayuda, no reemplaza a los servicios de emergencia.
                </Text>
                <TouchableOpacity style={styles.primario} onPress={activar} disabled={enviando}>
                  {enviando ? <ActivityIndicator color="#fff" /> : <Siren size={20} color="#fff" />}
                  <Text style={styles.primarioTexto}>Sí, avisar ahora</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secundario} onPress={() => llamar('911')}>
                  <Phone size={16} color={colors.slate[700]} />
                  <Text style={styles.secundarioTexto}>Llamar al 911 sin avisar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.cuerpo}>
                  {error
                    ? `No pudimos avisar al equipo (${error}). Llamá al 911 ahora.`
                    : 'El equipo de DOAPP fue avisado. Si estás en peligro, llamá ya al 911.'}
                </Text>
                <TouchableOpacity style={[styles.primario, { paddingVertical: 16 }]} onPress={() => llamar(listo)}>
                  <Phone size={20} color="#fff" />
                  <Text style={[styles.primarioTexto, { fontSize: fontSize.lg }]}>Llamar al {listo}</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.pie}>
              Herramienta gratuita de ayuda. DOAPP no es un servicio de seguridad ni de respuesta y no garantiza
              disponibilidad ni resultado (T&C 11.3).
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 2, borderColor: colors.danger[500], backgroundColor: colors.danger[50],
    borderRadius: borderRadius.lg, paddingVertical: 12, paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  botonTexto: { color: colors.danger[700], fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', padding: spacing.md },
  tarjeta: { backgroundColor: '#fff', borderRadius: 20, padding: spacing.lg },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.danger[700], flex: 1 },
  cuerpo: { marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.slate[700], lineHeight: 20 },
  primario: {
    marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.danger[600], borderRadius: borderRadius.lg, paddingVertical: 14,
  },
  primarioTexto: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.base },
  secundario: {
    marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.slate[300], borderRadius: borderRadius.lg, paddingVertical: 12,
  },
  secundarioTexto: { color: colors.slate[700], fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  pie: { marginTop: spacing.md, fontSize: 11, color: colors.slate[400], lineHeight: 15 },
});
