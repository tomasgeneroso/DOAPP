import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react-native';
import {
  changePassword,
  cambiarContrasenaConCodigo,
  enviarCodigoDeContrasena,
  establecerContrasena,
  hasPassword as pedirTieneContrasena,
} from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Cambiar la contraseña desde la app.
 *
 *  - Con la actual (lo normal).
 *  - «No recuerdo mi contraseña actual»: se pide un código de 6 números al correo y se cambia con él. El código vale 5 minutos y
 *    sirve una sola vez; al cambiar, el servidor cierra todas las sesiones y se vuelve a entrar con la contraseña nueva.
 *  - Quien se registró con Google o X y no tiene contraseña la establece con el mismo código del correo.
 *
 * Siempre hace falta una de las dos pruebas: la contraseña actual o el código del correo.
 */
export default function CambiarContrasenaScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { logout } = useAuth();

  const [tiene, setTiene] = useState<boolean | null>(null);
  const [modo, setModo] = useState<'actual' | 'codigo'>('actual');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const aparece = useRef(new Animated.Value(0)).current;
  const salida = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El aviso aparece con un fundido (no de golpe).
  useEffect(() => {
    aparece.setValue(0);
    if (msg) Animated.timing(aparece, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [msg, aparece]);

  useEffect(() => {
    let vivo = true;
    pedirTieneContrasena()
      .then((r) => {
        if (vivo && r.success) setTiene(Boolean((r as any).hasPassword));
      })
      .catch(() => {
        if (vivo) setTiene(true);
      });
    return () => {
      vivo = false;
      if (salida.current) clearTimeout(salida.current);
    };
  }, []);

  const [verClaves, setVerClaves] = useState(false);
  const input = [styles.input, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }];
  /** Un campo de contraseña con el ojito para verla mientras se escribe. */
  const campoDeClave = (valor: string, cambiar: (v: string) => void, autoComplete: 'current-password' | 'new-password') => (
    <View>
      <TextInput style={[...input, { paddingRight: 48 }]} secureTextEntry={!verClaves} value={valor} onChangeText={cambiar} autoCapitalize="none" autoCorrect={false} autoComplete={autoComplete} />
      <TouchableOpacity style={styles.ojo} onPress={() => setVerClaves((v) => !v)} accessibilityLabel={verClaves ? 'Ocultar la contraseña' : 'Mostrar la contraseña'} accessibilityRole="button">
        {verClaves ? <EyeOff size={20} color={themeColors.text.muted} /> : <Eye size={20} color={themeColors.text.muted} />}
      </TouchableOpacity>
    </View>
  );

  const validarNueva = (): string | null => {
    if (nueva.length < 6) return 'La contraseña nueva debe tener al menos 6 caracteres.';
    if (nueva !== repetida) return 'Las contraseñas no coinciden.';
    return null;
  };

  const enviarCodigo = async () => {
    setMsg(null);
    setCargando(true);
    try {
      const r = await enviarCodigoDeContrasena();
      if (r.success) {
        setCodigoEnviado(true);
        setMsg({ tipo: 'ok', texto: r.message || 'Te enviamos un código a tu correo.' });
      } else {
        setMsg({ tipo: 'error', texto: r.message || 'No pudimos enviar el código.' });
      }
    } finally {
      setCargando(false);
    }
  };

  const guardar = async () => {
    setMsg(null);
    const problema = validarNueva();
    if (problema) {
      setMsg({ tipo: 'error', texto: problema });
      return;
    }
    if (usaCodigo && !/^\d{6}$/.test(codigo.trim())) {
      setMsg({ tipo: 'error', texto: 'El código tiene 6 números: está en el correo que te enviamos.' });
      return;
    }
    setCargando(true);
    try {
      const r: any = usaCodigo
        ? tiene
          ? await cambiarContrasenaConCodigo(codigo.trim(), nueva)
          : await establecerContrasena(codigo.trim(), nueva)
        : await changePassword(actual, nueva);
      if (r.success) {
        setMsg({ tipo: 'ok', texto: r.message || 'Contraseña actualizada.' });
        setActual('');
        setNueva('');
        setRepetida('');
        setCodigo('');
        setTiene(true);
        if (r.logout) {
          // Se cerraron todas las sesiones por seguridad: se vuelve a entrar con la contraseña nueva.
          salida.current = setTimeout(async () => {
            try {
              await logout();
            } finally {
              router.replace('/(auth)/login');
            }
          }, 2500);
        }
      } else {
        setMsg({ tipo: 'error', texto: r.message || 'No se pudo cambiar la contraseña.' });
      }
    } finally {
      setCargando(false);
    }
  };

  // Sin contraseña todavía, el código del correo es el único camino; con contraseña, es la alternativa a la actual.
  const usaCodigo = tiene === false || modo === 'codigo';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Cambiar contraseña</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {tiene === null ? (
            <ActivityIndicator size="large" color={themeColors.primary[600]} style={{ marginTop: spacing.xl }} />
          ) : (
            <View>
              <View style={[styles.icono, { backgroundColor: themeColors.primary[50] }]}>
                <Lock size={28} color={themeColors.primary[600]} />
              </View>

              {!tiene && (
                <View style={[styles.aviso, { backgroundColor: themeColors.primary[50] }]}>
                  <Text style={[styles.avisoTexto, { color: themeColors.primary[600] }]}>
                    Te registraste con Google o X. Establecé una contraseña para poder entrar también con tu correo.
                  </Text>
                </View>
              )}

              {msg && (
                <Animated.View
                  style={[
                    styles.msg,
                    { opacity: aparece, backgroundColor: msg.tipo === 'ok' ? '#ecfdf5' : '#fef2f2', borderColor: msg.tipo === 'ok' ? '#a7f3d0' : '#fecaca' },
                  ]}
                  accessibilityRole={msg.tipo === 'error' ? 'alert' : undefined}
                >
                  <Text style={{ color: msg.tipo === 'ok' ? '#065f46' : '#991b1b', fontSize: fontSize.sm }}>{msg.texto}</Text>
                </Animated.View>
              )}

              {tiene && !usaCodigo && (
                <View style={styles.grupo}>
                  <Text style={[styles.label, { color: themeColors.text.primary }]}>Contraseña actual</Text>
                  {campoDeClave(actual, setActual, 'current-password')}
                  <TouchableOpacity
                    onPress={() => {
                      setModo('codigo');
                      setMsg(null);
                    }}
                  >
                    <Text style={[styles.enlace, { color: themeColors.primary[600] }]}>No recuerdo mi contraseña actual</Text>
                  </TouchableOpacity>
                </View>
              )}

              {usaCodigo && (
                <View style={styles.grupo}>
                  {!codigoEnviado ? (
                    <>
                      <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>
                        Te enviamos un código de 6 números al correo de tu cuenta. Vale 5 minutos y sirve una sola vez.
                      </Text>
                      <TouchableOpacity style={[styles.boton, cargando && styles.botonApagado]} onPress={enviarCodigo} disabled={cargando}>
                        <Text style={styles.botonTexto}>{cargando ? 'Enviando…' : 'Enviarme el código por correo'}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.label, { color: themeColors.text.primary }]}>Código del correo</Text>
                      <TextInput
                        style={[...input, styles.codigo]}
                        value={codigo}
                        onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        placeholder="000000"
                        placeholderTextColor={themeColors.text.muted}
                      />
                      <TouchableOpacity onPress={enviarCodigo} disabled={cargando}>
                        <Text style={[styles.enlace, { color: themeColors.primary[600] }]}>Enviarme otro código</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {tiene && (
                    <TouchableOpacity
                      onPress={() => {
                        setModo('actual');
                        setCodigoEnviado(false);
                        setMsg(null);
                      }}
                    >
                      <Text style={[styles.enlace, { color: themeColors.text.muted }]}>Prefiero usar mi contraseña actual</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {(!usaCodigo || codigoEnviado) && (
                <>
                  <View style={styles.grupo}>
                    <Text style={[styles.label, { color: themeColors.text.primary }]}>Contraseña nueva</Text>
                    {campoDeClave(nueva, setNueva, 'new-password')}
                  </View>
                  <View style={styles.grupo}>
                    <Text style={[styles.label, { color: themeColors.text.primary }]}>Repetí la contraseña nueva</Text>
                    {campoDeClave(repetida, setRepetida, 'new-password')}
                  </View>
                  <TouchableOpacity style={[styles.boton, cargando && styles.botonApagado]} onPress={guardar} disabled={cargando}>
                    <Text style={styles.botonTexto}>{cargando ? 'Guardando…' : tiene ? 'Cambiar contraseña' : 'Establecer contraseña'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  scroll: { padding: spacing.lg },
  icono: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg },
  aviso: { padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.lg },
  avisoTexto: { fontSize: fontSize.sm },
  msg: { padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.lg },
  grupo: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  ayuda: { fontSize: fontSize.sm, marginBottom: spacing.md },
  input: { height: 48, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, fontSize: fontSize.base, borderWidth: 1 },
  codigo: { letterSpacing: 8, textAlign: 'center', fontSize: fontSize.xl },
  ojo: { position: 'absolute', right: 0, top: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  enlace: { fontSize: fontSize.sm, marginTop: spacing.sm, textDecorationLine: 'underline' },
  boton: { backgroundColor: colors.primary[600], height: 48, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  botonApagado: { opacity: 0.6 },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
