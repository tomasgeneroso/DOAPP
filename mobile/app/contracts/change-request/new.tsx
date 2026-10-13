import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Pantalla from '../../../components/Pantalla';
import { useTheme } from '../../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../constants/theme';
import { LIMITE_MOTIVO, LIMITE_NOTA, armarSolicitud, pedirCambio, sinEmpezar } from '../../../services/solicitudesDeCambio';

/**
 * Pedir un cambio o la cancelación de un contrato. La otra parte tiene que aceptar; si no responde en 2 días pasa a soporte.
 * El precio no se cambia por acá. Cancelar abre una cancelación de mutuo acuerdo que revisa un administrador, que es quien
 * resuelve el dinero.
 */
export default function PedirCambioScreen() {
  const { contractId, estado } = useLocalSearchParams<{ contractId: string; estado?: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [tipo, setTipo] = useState<'modify' | 'cancel'>('modify');
  const [motivo, setMotivo] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const id = String(Array.isArray(contractId) ? contractId[0] : contractId || '');
  const estadoDelContrato = String(Array.isArray(estado) ? estado[0] : estado || '');

  const enviar = async () => {
    setError('');
    const r = armarSolicitud(id, estadoDelContrato, { tipo, motivo, inicio, fin, nota });
    if (r.ok === false) return setError(r.error);
    setEnviando(true);
    try {
      const res = await pedirCambio(r.cuerpo);
      if (res.ok) {
        Alert.alert('Solicitud enviada', 'La otra parte tiene 2 días para responder. Si no responde, la solicitud pasa a soporte.');
        router.replace(`/contracts/${id}` as any);
      } else setError(res.mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const etiqueta = (texto: string) => <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>{texto}</Text>;
  const estiloInput = [styles.input, { color: themeColors.text.primary, borderColor: themeColors.border, backgroundColor: themeColors.card }];

  return (
    <Pantalla titulo="Pedir un cambio" error={error} volverA={id ? `/contracts/${id}` : '/contracts'}>
      <View style={styles.chips}>
        {([['modify', 'Cambiar fechas o nota'], ['cancel', 'Cancelar el contrato']] as const).map(([valor, texto]) => {
          const elegido = tipo === valor;
          return (
            <TouchableOpacity
              key={valor}
              onPress={() => setTipo(valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegido }}
              style={[styles.chip, { borderColor: elegido ? (valor === 'cancel' ? colors.danger[600] : colors.primary[600]) : themeColors.border, backgroundColor: elegido ? (valor === 'cancel' ? colors.danger[50] : colors.primary[50]) : 'transparent' }]}
            >
              <Text style={{ color: elegido ? (valor === 'cancel' ? colors.danger[600] : colors.primary[700]) : themeColors.text.primary, fontWeight: fontWeight.medium }}>{texto}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {etiqueta(tipo === 'cancel' ? 'Motivo de la cancelación *' : 'Motivo del cambio *')}
      <TextInput value={motivo} onChangeText={setMotivo} multiline maxLength={LIMITE_MOTIVO} placeholder="Contá brevemente por qué" placeholderTextColor={themeColors.text.muted} style={[...estiloInput, styles.multilinea]} />

      {tipo === 'modify' ? (
        <>
          <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>
            Podés pedir mover la fecha de fin, la de inicio (solo antes de empezar) o agregar una nota. El precio no se cambia desde acá: escribinos desde el Centro de ayuda.
          </Text>
          {sinEmpezar(estadoDelContrato) && (
            <>
              {etiqueta('Nuevo inicio (AAAA-MM-DD)')}
              <TextInput value={inicio} onChangeText={setInicio} placeholder="2026-12-01" placeholderTextColor={themeColors.text.muted} autoCapitalize="none" style={estiloInput} />
            </>
          )}
          {etiqueta('Nuevo fin (AAAA-MM-DD)')}
          <TextInput value={fin} onChangeText={setFin} placeholder="2026-12-15" placeholderTextColor={themeColors.text.muted} autoCapitalize="none" style={estiloInput} />
          {etiqueta('Nota (opcional)')}
          <TextInput value={nota} onChangeText={setNota} multiline maxLength={LIMITE_NOTA} placeholder="Algo más que tenga que saber" placeholderTextColor={themeColors.text.muted} style={[...estiloInput, styles.multilinea, { height: 80 }]} />
        </>
      ) : (
        <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>
          Si la otra parte acepta, se abre una cancelación de mutuo acuerdo que revisa un administrador: es quien resuelve el dinero según los términos. El contrato sigue como está hasta entonces.
        </Text>
      )}

      <TouchableOpacity style={[styles.boton, tipo === 'cancel' && { backgroundColor: colors.danger[600] }, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Enviar solicitud</Text>}
      </TouchableOpacity>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { flex: 1, borderWidth: 1, borderRadius: borderRadius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.base },
  multilinea: { height: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  ayuda: { fontSize: fontSize.xs, lineHeight: 18, marginTop: spacing.md },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
