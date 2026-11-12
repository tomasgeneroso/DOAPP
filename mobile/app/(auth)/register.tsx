import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import Logo from '../../components/ui/Logo';
import ContactarSoporte from '../../components/ContactarSoporte';
import BotonesSociales from '../../components/BotonesSociales';
import { mensajeDelRegistro, normalizarCodigo } from '../../services/invitaciones';
import { motivoDeDniImposible } from '../../../shared/identidad/documentos';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const { colors: themeColors } = useTheme();
  // Viene de «Crear mi cuenta con la invitación» (enlace de un creador de contenido). El servidor valida y canjea.
  const { invitacion } = useLocalSearchParams<{ invitacion?: string }>();
  const invitationCode = normalizarCodigo(invitacion);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    dni: '',
    phone: '',
    referralCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async () => {
    // Registro en UN solo paso (regla del dueño, 2026-11-12): todo lo necesario se pide acá, igual que en la web.
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('Escribí tu nombre y tu apellido');
      return;
    }

    const usuario = formData.username.trim().toLowerCase();
    if (usuario.length < 3 || !/^[a-z0-9._]+$/.test(usuario) || /^[._]|[._]$/.test(usuario) || /[._]{2,}/.test(usuario)) {
      setError('El nombre de usuario debe tener entre 3 y 30 caracteres: letras, números, puntos y guiones bajos (sin empezar ni terminar con uno, ni dos seguidos)');
      return;
    }

    if (!formData.email.trim() || !formData.password) {
      setError('Escribí tu correo y una contraseña');
      return;
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    const dni = formData.dni.trim();
    if (!/^\d{7,9}$/.test(dni)) {
      setError('Escribí tu DNI: solo el número, sin puntos ni espacios (7 a 9 dígitos)');
      return;
    }
    const dniImposible = motivoDeDniImposible(dni);
    if (dniImposible) {
      setError(dniImposible);
      return;
    }

    if (!termsAccepted) {
      setError('Debes aceptar los términos y condiciones');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Sin sesión: para ingresar hay que confirmar el correo (llega un enlace). Con Didit apagado alcanza el DNI; si se enciende, se pide desde el perfil.
      const response = await register({
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        username: usuario,
        email: formData.email.trim(),
        password: formData.password,
        dni,
        phone: formData.phone.trim() || undefined,
        sinSesion: true,
        referralCode: formData.referralCode.trim() || undefined,
        invitationCode: invitationCode || undefined,
        termsAccepted: true,
      });

      if (response.success) {
        // Si venía con una invitación, se le cuenta si se aplicó (o por qué no).
        const aviso = mensajeDelRegistro(response);
        if (aviso) Alert.alert(aviso.aplicada ? 'Invitación aplicada' : 'La invitación no se aplicó', aviso.mensaje);
        Alert.alert(
          'Revisá tu correo',
          'Te mandamos un enlace para confirmar tu correo. Importante: los beneficios de lanzamiento (contrato sin comisión y mes de PRO gratis) se activan recién cuando lo confirmás, y sin confirmarlo no podés publicar ni trabajar. Después de abrir el enlace, ingresá con tu correo y tu contraseña.',
          [{ text: 'Ir a ingresar', onPress: () => router.replace('/(auth)/login' as any) }],
        );
      } else {
        setError(response.message || 'Error al registrarse');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card Container */}
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Logo size="large" />
            </View>

            {/* Back to Home */}
            <Link href="/(tabs)" asChild>
              <TouchableOpacity style={styles.backButton}>
                <ArrowLeft size={18} color={themeColors.text.secondary} />
                <Text style={[styles.backText, { color: themeColors.text.secondary }]}>Volver al inicio</Text>
              </TouchableOpacity>
            </Link>

            {/* Title */}
            <Text style={[styles.title, { color: themeColors.text.primary }]}>Crea tu cuenta</Text>

            {/* Promo Banner */}
            <View style={styles.promoBanner}>
              <Text style={styles.promoText}>
                Las primeras 2000 cuentas tienen 1 contrato sin comisión (una sola vez) y PRO gratis por 1 mes 🎉 Para recibirlos tenés que confirmar tu correo con el enlace que te mandamos al registrarte.
              </Text>
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { borderBottomColor: themeColors.border }]}>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.tab}>
                  <Text style={[styles.tabText, { color: themeColors.text.muted }]}>Iniciar Sesión</Text>
                </TouchableOpacity>
              </Link>
              <TouchableOpacity style={[styles.tab, styles.tabActive]}>
                <Text style={[styles.tabText, styles.tabTextActive]}>Registrarme</Text>
              </TouchableOpacity>
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Form */}
            {/* Google y X primero, el formulario después */}
            <BotonesSociales accion="registrarte" />

            <View style={styles.form}>
              {/* Nombre y apellido */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>Nombre/s</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="Juan"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.firstName}
                  onChangeText={(v) => updateField('firstName', v)}
                  autoCapitalize="words"
                  autoComplete="given-name"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>Apellido/s</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="Pérez"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.lastName}
                  onChangeText={(v) => updateField('lastName', v)}
                  autoCapitalize="words"
                  autoComplete="family-name"
                />
              </View>

              {/* Nombre de usuario */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>Nombre de usuario</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="juanperez"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.username}
                  onChangeText={(v) => updateField('username', v.toLowerCase())}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
                <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                  Es tu dirección pública: doapp.com/u/tunombredeusuario
                </Text>
              </View>

              {/* Email */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="tucorreo@email.com"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.email}
                  onChangeText={(v) => updateField('email', v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Contraseña */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>Contraseña</Text>
                <View style={[styles.passwordContainer, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: themeColors.text.primary }]}
                    placeholder="••••••••"
                    placeholderTextColor={themeColors.text.muted}
                    value={formData.password}
                    onChangeText={(v) => updateField('password', v)}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={themeColors.text.muted} strokeWidth={1.5} />
                    ) : (
                      <Eye size={20} color={themeColors.text.muted} strokeWidth={1.5} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* DNI */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>DNI</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="12345678"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.dni}
                  onChangeText={(v) => updateField('dni', v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={9}
                />
                <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                  Solo el número, sin puntos ni espacios. Se usa únicamente para verificar tu identidad y cumplir con la normativa de pagos; nunca se muestra a otros usuarios.
                </Text>
              </View>

              {/* Teléfono */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>
                  Teléfono <Text style={{ color: themeColors.text.muted, fontWeight: fontWeight.normal }}>(opcional)</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="+54 11 1234-5678"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.phone}
                  onChangeText={(v) => updateField('phone', v)}
                  keyboardType="phone-pad"
                />
                <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                  Solo lo usamos para avisarte de tus contratos. No aparece en tu perfil ni lo damos a otros usuarios.
                </Text>
              </View>

              {/* Código de referido */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>
                  Código de referido <Text style={{ color: themeColors.text.muted, fontWeight: fontWeight.normal }}>(opcional)</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="ABC12345 / FAM-ABCD2345"
                  placeholderTextColor={themeColors.text.muted}
                  value={formData.referralCode}
                  onChangeText={(v) => updateField('referralCode', v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={16}
                />
                <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                  Si alguien te invitó, ingresá su código aquí. También sirve un código de familia (con o sin FAM-).
                </Text>
              </View>

              {!!invitationCode && (
                <View style={{ borderWidth: 1, borderColor: colors.success[400], backgroundColor: colors.success[50], borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md }}>
                  <Text style={{ color: colors.success[700], fontWeight: fontWeight.semibold }}>Venís con una invitación</Text>
                  <Text style={{ color: colors.success[700], fontSize: fontSize.sm, marginTop: 2 }}>
                    Al crear tu cuenta se aplica: no pagás comisión por tus contratos como Cliente durante el plazo de la invitación (Términos, punto 7.11).
                  </Text>
                </View>
              )}

              {/* Terms checkbox */}
              <View style={styles.termsContainer}>
                <TouchableOpacity
                  onPress={() => setTermsAccepted(!termsAccepted)}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                >
                  <View style={[styles.checkbox, { borderColor: themeColors.border }, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.termsText, { color: themeColors.text.secondary }]}>
                    Acepto los{' '}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/legal/terms' as any)} activeOpacity={0.7}>
                  <Text style={styles.termsLink}>Términos y Condiciones</Text>
                </TouchableOpacity>
                <Text style={[styles.termsText, { color: themeColors.text.secondary }]}> y la </Text>
                <TouchableOpacity onPress={() => router.push('/legal/privacy' as any)} activeOpacity={0.7}>
                  <Text style={styles.termsLink}>Política de Privacidad</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Registrarme</Text>
                )}
              </TouchableOpacity>
            </View>

            <ContactarSoporte tema="registrarte" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  card: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    borderWidth: 1,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  backText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  promoBanner: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  promoText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary[600],
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  tabTextActive: {
    color: colors.primary[600],
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger[50],
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorIcon: {
    marginRight: spacing.sm,
    fontSize: fontSize.lg,
  },
  errorText: {
    flex: 1,
    color: colors.danger[600],
    fontSize: fontSize.sm,
  },
  form: {
    gap: spacing.sm,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  usernamePrefix: {
    paddingLeft: spacing.md,
    fontSize: fontSize.base,
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.base,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  eyeButton: {
    padding: spacing.md,
  },
  helperText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  checkmark: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  termsText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  termsLink: {
    color: colors.primary[600],
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
  },
  button: {
    height: 48,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.sm,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  socialButton: {
    minWidth: 120,
    height: 48,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  googleLogo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleBlue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#4285F4',
  },
  googleRed: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#EA4335',
  },
  googleYellow: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#FBBC05',
  },
  googleGreen: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#34A853',
  },
  xLogo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  xText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
});
