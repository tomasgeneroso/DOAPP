import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { motivoValido } from '../services/admin';

/**
 * Pide un motivo escrito antes de una acción que lo necesita (rechazar un pago, un contrato, una publicación).
 *
 * Propio y no `Alert.prompt` porque ese sólo existe en iOS: en Android la acción quedaba sin forma de escribir el motivo.
 * El botón de confirmar no se habilita hasta que el motivo llega al mínimo.
 */
export default function PedirMotivo({
  visible,
  titulo,
  ayuda,
  minimo,
  etiquetaConfirmar = 'Confirmar',
  trabajando = false,
  placeholder,
  onCancelar,
  onConfirmar,
}: {
  visible: boolean;
  titulo: string;
  ayuda?: string;
  minimo: number;
  etiquetaConfirmar?: string;
  trabajando?: boolean;
  /** Texto del campo. Por defecto cuenta el mínimo; con un motivo opcional conviene decirlo. */
  placeholder?: string;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const { colors: themeColors } = useTheme();
  const [motivo, setMotivo] = useState('');

  // Cada vez que se abre arranca vacío: un motivo escrito para otra cosa no se arrastra.
  useEffect(() => {
    if (visible) setMotivo('');
  }, [visible]);

  const valido = motivoValido(motivo, minimo);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancelar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fondo}>
        <View style={[styles.hoja, { backgroundColor: themeColors.card }]}>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>{titulo}</Text>
          {!!ayuda && <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>{ayuda}</Text>}
          <TextInput
            value={motivo}
            onChangeText={setMotivo}
            multiline
            autoFocus
            placeholder={placeholder ?? `Motivo (mínimo ${minimo} caracteres)`}
            placeholderTextColor={themeColors.text.muted}
            style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
          />
          <View style={styles.botones}>
            <TouchableOpacity style={[styles.boton, { borderColor: themeColors.border, borderWidth: 1 }]} onPress={onCancelar} disabled={trabajando}>
              <Text style={{ color: themeColors.text.primary, fontWeight: fontWeight.medium }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: colors.danger[600] }, (!valido || trabajando) && { opacity: 0.5 }]}
              onPress={() => onConfirmar(motivo.trim())}
              disabled={!valido || trabajando}
            >
              <Text style={{ color: '#fff', fontWeight: fontWeight.semibold }}>{etiquetaConfirmar}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.5)' },
  hoja: { borderRadius: borderRadius.xl, padding: spacing.lg },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  ayuda: { fontSize: fontSize.sm, marginTop: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, minHeight: 90, marginTop: spacing.md, textAlignVertical: 'top', fontSize: fontSize.base },
  botones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  boton: { flex: 1, height: 44, borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center' },
});
