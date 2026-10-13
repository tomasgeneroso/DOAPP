import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import Pantalla from '../components/Pantalla';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { ASUNTOS, LIMITE_MENSAJE, LIMITE_NOMBRE, enviarContacto } from '../services/contacto';

/** Formulario de contacto: consultas, soporte técnico o reclamos. Funciona también sin sesión iniciada. */
export default function ContactoScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const [nombre, setNombre] = useState(user?.name || '');
  const [correo, setCorreo] = useState(user?.email || '');
  const [asunto, setAsunto] = useState<string>('general');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      const r = await enviarContacto({ nombre, correo, asunto, mensaje });
      if (r.ok) setEnviado(true);
      else setError(r.mensaje);
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <Pantalla titulo="Contacto" volverA="/help">
        <View style={styles.exito}>
          <CheckCircle2 size={56} color={colors.success[600]} />
          <Text style={[styles.exitoTitulo, { color: themeColors.text.primary }]}>¡Mensaje enviado!</Text>
          <Text style={[styles.exitoTexto, { color: themeColors.text.secondary }]}>Recibimos tu mensaje. Te vamos a responder por correo.</Text>
          <TouchableOpacity style={styles.boton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/help' as any))}>
            <Text style={styles.botonTexto}>Listo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setMensaje(''); setEnviado(false); }} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.primary[600] }}>Enviar otro mensaje</Text>
          </TouchableOpacity>
        </View>
      </Pantalla>
    );
  }

  const etiqueta = (texto: string) => <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>{texto}</Text>;
  const estiloInput = [styles.input, { color: themeColors.text.primary, borderColor: themeColors.border, backgroundColor: themeColors.card }];

  return (
    <Pantalla titulo="Contacto" error={error} volverA="/help">
      <Text style={[styles.intro, { color: themeColors.text.secondary }]}>
        Escribinos y te respondemos por correo. Si tenés un problema con un contrato o un pago, mejor abrí un ticket o una disputa desde el Centro de ayuda.
      </Text>

      {etiqueta('Nombre *')}
      <TextInput value={nombre} onChangeText={setNombre} maxLength={LIMITE_NOMBRE} placeholder="Tu nombre" placeholderTextColor={themeColors.text.muted} style={estiloInput} />

      {etiqueta('Correo *')}
      <TextInput
        value={correo}
        onChangeText={setCorreo}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="vos@correo.com"
        placeholderTextColor={themeColors.text.muted}
        style={estiloInput}
      />

      {etiqueta('Asunto *')}
      <View style={styles.chips}>
        {ASUNTOS.map((a) => {
          const elegido = asunto === a.id;
          return (
            <TouchableOpacity
              key={a.id}
              onPress={() => setAsunto(a.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegido }}
              style={[styles.chip, { borderColor: elegido ? colors.primary[600] : themeColors.border, backgroundColor: elegido ? colors.primary[50] : 'transparent' }]}
            >
              <Text style={{ color: elegido ? colors.primary[700] : themeColors.text.primary }}>{a.etiqueta}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {etiqueta('Mensaje *')}
      <TextInput
        value={mensaje}
        onChangeText={setMensaje}
        multiline
        maxLength={LIMITE_MENSAJE}
        placeholder="Escribí tu mensaje acá..."
        placeholderTextColor={themeColors.text.muted}
        style={[...estiloInput, styles.mensaje]}
      />
      <Text style={[styles.contador, { color: themeColors.text.muted }]}>{mensaje.length}/{LIMITE_MENSAJE}</Text>

      <TouchableOpacity style={[styles.boton, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Enviar mensaje</Text>}
      </TouchableOpacity>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: fontSize.sm, lineHeight: 20 },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.base },
  mensaje: { height: 150, paddingTop: spacing.md, textAlignVertical: 'top' },
  contador: { fontSize: fontSize.xs, textAlign: 'right', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg, alignSelf: 'stretch' },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  exito: { alignItems: 'center', paddingTop: spacing['2xl'] },
  exitoTitulo: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, marginTop: spacing.lg },
  exitoTexto: { fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
});
