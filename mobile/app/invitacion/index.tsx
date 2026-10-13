import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { extraerCodigo } from '../../services/invitaciones';

/** «Tengo una invitación»: se pega el código o el enlace que mandó el creador de contenido. */
export default function TengoUnaInvitacion() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');

  const seguir = () => {
    const codigo = extraerCodigo(texto);
    if (!codigo) {
      setError('No reconocemos ese código. Pegá el enlace completo o el código que empieza con INF-.');
      return;
    }
    setError('');
    router.push(`/invitacion/${codigo}` as any);
  };

  return (
    <Pantalla titulo="Tengo una invitación" error={error}>
      <Text style={[styles.texto, { color: themeColors.text.secondary }]}>
        Si un creador de contenido te pasó un enlace de invitación, pegalo acá (o escribí el código) y te contamos qué incluye.
      </Text>
      <TextInput
        value={texto}
        onChangeText={(t) => { setTexto(t); setError(''); }}
        placeholder="https://doapparg.com/invitacion/INF-…"
        placeholderTextColor={themeColors.text.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
      />
      <TouchableOpacity style={[styles.boton, !texto.trim() && { opacity: 0.5 }]} onPress={seguir} disabled={!texto.trim()}>
        <Text style={styles.botonTexto}>Continuar</Text>
      </TouchableOpacity>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  texto: { fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.lg },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 50, fontSize: fontSize.base, backgroundColor: '#fff' },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
