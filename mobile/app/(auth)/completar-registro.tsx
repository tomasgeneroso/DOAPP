import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Linking, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { put } from '../../services/api';
import { completarElRegistro, datosDelRegistro, estadoDeVerificacion, iniciarVerificacion, type DatosDelRegistro } from '../../services/auth';
import { spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import ContactarSoporte from '../../components/ContactarSoporte';

/**
 * Registro en pasos:
 *   1. Correo y contraseña (o Google/X)      → ya hecho cuando se llega acá
 *   2. Verificación de identidad con Didit   → de ahí salen el nombre, el apellido y el DNI
 *   3. Revisar esos datos y completar lo que falta (usuario, teléfono; y el correo si la cuenta viene de X)
 *
 * Igual que en la web (`/complete-registration`). Las cuentas de antes que quedaron sin DNI (Google/X con el registro viejo) siguen su
 * camino: el DNI y listo.
 */
export default function CompletarRegistro() {
  const { colors: themeColors, } = useTheme();
  const { user, refreshUser, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const pendiente = !!user?.registrationPending;
  const identidadHecha = !!user?.dniVerified || ['Approved', 'In Review'].includes(String(user?.kycStatus));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/(auth)/login' as any);
  }, [isLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const input = [styles.input, { color: themeColors.text.primary, borderColor: themeColors.border, backgroundColor: themeColors.card }];
  const texto = { color: themeColors.text.secondary };

  // ───────── Paso 2: Didit ─────────
  const [abriendo, setAbriendo] = useState(false);
  const [esperando, setEsperando] = useState(false);
  const [errorDidit, setErrorDidit] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    try {
      const r = await estadoDeVerificacion();
      if (r.success) await refreshUser();
    } catch {
      /* sin respuesta: se vuelve a preguntar cuando la persona vuelva a la app */
    }
  }, [refreshUser]);

  // Al volver del navegador (Didit termina en una página web), se le pregunta al servidor cómo salió.
  useEffect(() => {
    if (!pendiente || identidadHecha) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') consultar();
    });
    return () => sub.remove();
  }, [pendiente, identidadHecha, consultar]);

  const empezarDidit = async () => {
    setErrorDidit(null);
    setAbriendo(true);
    try {
      const r = await iniciarVerificacion();
      if (r.success && r.url) {
        await Linking.openURL(r.url);
        setEsperando(true);
      } else {
        setErrorDidit(r.message || 'No pudimos iniciar la verificación.');
      }
    } catch (e: any) {
      setErrorDidit(e?.message || 'Error de conexión');
    } finally {
      setAbriendo(false);
    }
  };

  // ───────── Paso 3: datos ─────────
  const [datos, setDatos] = useState<DatosDelRegistro | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [form, setForm] = useState({ nombres: '', apellidos: '', dni: '', username: '', phone: '', email: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cargado = useRef(false);

  useEffect(() => {
    if (!pendiente || !identidadHecha || cargado.current) return;
    cargado.current = true;
    setCargandoDatos(true);
    datosDelRegistro()
      .then((r) => {
        if (!r.success || !r.data) {
          setErrorGeneral(r.message || 'No pudimos traer los datos de tu documento.');
          return;
        }
        const x = r.data;
        setDatos(x);
        setForm({ nombres: x.sugerido.nombres, apellidos: x.sugerido.apellidos, dni: x.sugerido.dni, username: x.sugerido.username, phone: x.sugerido.telefono, email: '' });
      })
      .catch(() => setErrorGeneral('Error de conexión'))
      .finally(() => setCargandoDatos(false));
  }, [pendiente, identidadHecha]);

  const cambiar = (campo: keyof typeof form, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => {
      if (!e[campo]) return e;
      const { [campo]: _quitado, ...resto } = e;
      return resto;
    });
  };

  const terminar = async () => {
    setErrorGeneral(null);
    setErrores({});
    setGuardando(true);
    try {
      const r = await completarElRegistro({
        nombres: form.nombres,
        apellidos: form.apellidos,
        dni: form.dni.replace(/\D/g, ''),
        username: form.username,
        phone: form.phone || undefined,
        email: datos?.pedirCorreo ? form.email : undefined,
      });
      if (!r.success) {
        if (r.field) setErrores({ [r.field]: r.message || 'Revisá este dato.' });
        else setErrorGeneral(r.message || 'No pudimos completar tu registro.');
        return;
      }
      await refreshUser();
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      setErrorGeneral(e?.message || 'Error de conexión');
    } finally {
      setGuardando(false);
    }
  };

  // ───────── Cuentas de antes sin DNI ─────────
  const [dniViejo, setDniViejo] = useState('');
  const [errorViejo, setErrorViejo] = useState<string | null>(null);
  const guardarDniViejo = async () => {
    setErrorViejo(null);
    if (!/^\d{7,9}$/.test(dniViejo)) {
      setErrorViejo('El DNI debe tener entre 7 y 9 dígitos, solo números.');
      return;
    }
    setGuardando(true);
    try {
      const r: any = await put('/auth/complete-registration', { dni: dniViejo });
      if (!r.success) {
        setErrorViejo(r.message || r.errors?.[0]?.msg || 'No pudimos guardar tu DNI.');
        return;
      }
      await refreshUser();
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      setErrorViejo(e?.message || 'Error de conexión');
    } finally {
      setGuardando(false);
    }
  };

  if (isLoading || !user) {
    return (
      <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
        <View style={styles.centro}><ActivityIndicator size="large" color="#0284c7" /></View>
      </SafeAreaView>
    );
  }

  const campoDe = (id: keyof typeof form, etiqueta: string, opciones: { teclado?: any; mayus?: 'none' | 'words'; ayuda?: string; deDoc?: boolean } = {}) => (
    <View key={id}>
      <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>
        {etiqueta}{opciones.deDoc ? <Text style={styles.deDoc}>  de tu documento</Text> : null}
      </Text>
      <TextInput
        style={[...input, errores[id] ? { borderColor: '#dc2626' } : null]}
        value={form[id]}
        onChangeText={(v) => cambiar(id, id === 'dni' ? v.replace(/\D/g, '').slice(0, 9) : id === 'username' ? v.toLowerCase() : v)}
        keyboardType={opciones.teclado}
        autoCapitalize={opciones.mayus ?? 'none'}
        autoCorrect={false}
        placeholderTextColor={themeColors.text.muted}
      />
      {opciones.ayuda ? <Text style={[styles.ayuda, { color: themeColors.text.muted }]}>{opciones.ayuda}</Text> : null}
      {errores[id] ? <Text style={styles.error}>{errores[id]}</Text> : null}
    </View>
  );

  // Cuentas de antes: solo el DNI.
  if (!pendiente) {
    return (
      <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centro}>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Un último paso</Text>
          <Text style={[styles.texto, texto]}>Ingresá tu DNI. Es la clave de tu cuenta: no se puede repetir y después lo verificás con tu documento.</Text>
          <TextInput style={input} placeholder="12345678" placeholderTextColor={themeColors.text.muted} value={dniViejo} onChangeText={(v) => setDniViejo(v.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" maxLength={9} />
          {errorViejo && <Text style={styles.error}>{errorViejo}</Text>}
          <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.6 }]} onPress={guardarDniViejo} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Continuar</Text>}
          </TouchableOpacity>
          <View style={{ alignSelf: 'stretch' }}><ContactarSoporte tema="registrarte" /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const pasos = ['Cuenta', 'Identidad', 'Tus datos'];
  const actual = identidadHecha ? 3 : 2;
  const indicador = (
    <View style={styles.pasos} accessibilityLabel="Pasos del registro">
      {pasos.map((p, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const activo = n === actual;
        return (
          <View key={p} style={styles.paso}>
            <View style={[styles.punto, hecho ? { backgroundColor: '#10b981' } : activo ? { backgroundColor: '#0284c7' } : { backgroundColor: themeColors.border }]}>
              {hecho ? <Check size={12} color="#fff" /> : <Text style={{ color: activo ? '#fff' : themeColors.text.muted, fontSize: 11, fontWeight: '700' }}>{n}</Text>}
            </View>
            <Text style={{ color: activo ? themeColors.text.primary : themeColors.text.muted, fontSize: 11, fontWeight: activo ? '700' : '400' }}>{p}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={[styles.contenedor, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {indicador}

          {!identidadHecha ? (
            <>
              <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Verificá tu identidad</Text>
              <Text style={[styles.texto, texto]}>
                Con tu documento y una selfie. Tu nombre y tu DNI se completan solos desde el documento: después los revisás. Tené a mano tu DNI y permitile a Didit usar la cámara.
              </Text>
              {errorDidit && <Text style={styles.error}>{errorDidit}</Text>}
              <TouchableOpacity style={[styles.boton, abriendo && { opacity: 0.6 }]} onPress={empezarDidit} disabled={abriendo}>
                {abriendo ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>{esperando ? 'Abrir Didit de nuevo' : 'Continuar a Didit'}</Text>}
              </TouchableOpacity>
              {esperando && (
                <>
                  <Text style={[styles.ayuda, { color: themeColors.text.muted }]}>
                    Cuando termines en Didit, volvé a esta app: seguimos solos. Si no avanza, tocá el botón de abajo.
                  </Text>
                  <TouchableOpacity style={[styles.botonSecundario, { borderColor: themeColors.border }]} onPress={consultar}>
                    <Text style={[styles.botonSecundarioTexto, { color: themeColors.text.primary }]}>Ya terminé</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Revisá tus datos</Text>
              <Text style={[styles.texto, texto]}>
                {datos?.documento ? 'Esto es lo que leímos de tu documento. Si algo está mal, corregilo; y completá lo que falta.' : 'Completá tus datos para terminar.'}
              </Text>
              {cargandoDatos ? (
                <ActivityIndicator size="large" color="#0284c7" style={{ marginVertical: spacing.xl }} />
              ) : (
                <>
                  {campoDe('nombres', 'Nombre/s', { mayus: 'words', deDoc: !!datos?.documento?.nombres })}
                  {campoDe('apellidos', 'Apellido/s', { mayus: 'words', deDoc: !!datos?.documento?.apellidos })}
                  {campoDe('dni', 'DNI', { teclado: 'number-pad', deDoc: !!datos?.documento?.dni, ayuda: 'Se usa únicamente para verificar tu identidad y cumplir con la normativa de pagos. Nunca se muestra a otros usuarios.' })}
                  {datos?.pedirCorreo && campoDe('email', 'Correo', { teclado: 'email-address', ayuda: 'Tu cuenta de X no tiene correo: lo necesitamos para avisarte de tus contratos.' })}
                  {campoDe('username', 'Nombre de usuario', { ayuda: 'Letras, números, puntos y guiones bajos. Es la dirección de tu perfil.' })}
                  {campoDe('phone', 'Teléfono (opcional)', { teclado: 'phone-pad', ayuda: 'Solo lo usamos para avisarte de tus contratos y contactarte si hay un problema con un trabajo. No aparece en tu perfil ni lo usamos para publicidad.' })}
                  {datos?.documento && (
                    <Text style={styles.aviso}>
                      Podés corregir un error de lectura (una letra, un acento). Si cambiás el nombre o el DNI por otros que no son los de tu documento, un administrador va a revisar tu identidad antes de verificarla.
                    </Text>
                  )}
                  {errorGeneral && <Text style={styles.error}>{errorGeneral}</Text>}
                  <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.6 }]} onPress={terminar} disabled={guardando}>
                    {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Terminar mi registro</Text>}
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
          <View style={{ alignSelf: 'stretch' }}><ContactarSoporte tema="registrarte" /></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  centro: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  scroll: { padding: spacing.xl, gap: spacing.md },
  titulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  texto: { fontSize: fontSize.base },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 6 },
  deDoc: { fontSize: 11, color: '#059669', fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.base },
  ayuda: { fontSize: fontSize.xs, marginTop: 4 },
  aviso: { fontSize: fontSize.xs, color: '#92400e', backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md },
  error: { color: '#dc2626', fontSize: fontSize.sm, marginTop: 4 },
  boton: { backgroundColor: '#0284c7', paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  botonTexto: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.base },
  botonSecundario: { borderWidth: 1, paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  botonSecundarioTexto: { fontWeight: fontWeight.semibold, fontSize: fontSize.base },
  pasos: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  paso: { alignItems: 'center', gap: 4 },
  punto: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
