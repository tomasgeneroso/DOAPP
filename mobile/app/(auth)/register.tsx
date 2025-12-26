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
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import Logo from '../../components/ui/Logo';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
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
    // Validaciones
    if (!formData.name.trim() || !formData.email.trim() || !formData.password || !formData.dni) {
      setError('Por favor completa todos los campos obligatorios');
      return;
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (!termsAccepted) {
      setError('Debes aceptar los términos y condiciones');
      return;
    }

    // Validar DNI (7-9 dígitos para Argentina)
    if (!/^\d{7,9}$/.test(formData.dni)) {
      setError('El DNI debe tener 7 a 9 dígitos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await register({
        name: formData.name.trim(),
        username: formData.username.trim() || formData.email.split('@')[0],
        email: formData.email.trim(),
        password: formData.password,
        dni: formData.dni,
        phone: formData.phone.trim() || undefined,
        referralCode: formData.referralCode.trim() || undefined,
        termsAccepted: true,
      });

      if (response.success) {
        router.replace('/(tabs)');
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card Container - matching web design */}
          <View style={styles.card}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Logo size="large" />
            </View>

            {/* Back to Home */}
            <Link href="/(tabs)" asChild>
              <TouchableOpacity style={styles.backButton}>
                <Text style={styles.backIcon}>←</Text>
                <Text style={styles.backText}>Volver al inicio</Text>
              </TouchableOpacity>
            </Link>

            {/* Title */}
            <Text style={styles.title}>Crea tu cuenta</Text>

            {/* Promo Banner - matching web */}
            <View style={styles.promoBanner}>
              <Text style={styles.promoText}>
                ¡Los primeros 1000 usuarios tendrán servicio gratuito por un año! 🎉
              </Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.tab}>
                  <Text style={styles.tabText}>Iniciar Sesión</Text>
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
            <View style={styles.form}>
              {/* Nombre completo */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Juan Pérez"
                  placeholderTextColor={colors.slate[400]}
                  value={formData.name}
                  onChangeText={(v) => updateField('name', v)}
                  autoCapitalize="words"
                />
              </View>

              {/* Username */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nombre de usuario</Text>
                <View style={styles.usernameContainer}>
                  <Text style={styles.usernamePrefix}>@</Text>
                  <TextInput
                    style={styles.usernameInput}
                    placeholder="juanperez"
                    placeholderTextColor={colors.slate[400]}
                    value={formData.username}
                    onChangeText={(v) => updateField('username', v.toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                  />
                </View>
                <Text style={styles.helperText}>
                  Este será tu URL pública: doapp.com/u/tuusuario
                </Text>
              </View>

              {/* Email */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="tucorreo@email.com"
                  placeholderTextColor={colors.slate[400]}
                  value={formData.email}
                  onChangeText={(v) => updateField('email', v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Contraseña */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="••••••••"
                    placeholderTextColor={colors.slate[400]}
                    value={formData.password}
                    onChangeText={(v) => updateField('password', v)}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Teléfono */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+54 11 1234-5678"
                  placeholderTextColor={colors.slate[400]}
                  value={formData.phone}
                  onChangeText={(v) => updateField('phone', v)}
                  keyboardType="phone-pad"
                />
              </View>

              {/* DNI */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>DNI</Text>
                <TextInput
                  style={styles.input}
                  placeholder="12345678"
                  placeholderTextColor={colors.slate[400]}
                  value={formData.dni}
                  onChangeText={(v) => updateField('dni', v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={9}
                />
                <Text style={styles.helperText}>
                  Ingresá tu DNI sin puntos ni espacios (7-9 dígitos)
                </Text>
              </View>

              {/* Código de referido */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>
                  Código de referido <Text style={styles.optionalText}>(opcional)</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="ABC12345"
                  placeholderTextColor={colors.slate[400]}
                  value={formData.referralCode}
                  onChangeText={(v) => updateField('referralCode', v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={8}
                />
                <Text style={styles.helperText}>
                  Si alguien te invitó, ingresa su código aquí
                </Text>
              </View>

              {/* Terms checkbox */}
              <TouchableOpacity
                style={styles.termsContainer}
                onPress={() => setTermsAccepted(!termsAccepted)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                  {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.termsText}>
                  Acepto los{' '}
                  <Text style={styles.termsLink}>Términos y Condiciones</Text>
                </Text>
              </TouchableOpacity>

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

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o continúa con</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Login */}
            <View style={styles.socialButtons}>
              <TouchableOpacity style={styles.socialButton}>
                <View style={styles.googleLogo}>
                  <Text style={styles.googleBlue}>G</Text>
                  <Text style={styles.googleRed}>o</Text>
                  <Text style={styles.googleYellow}>o</Text>
                  <Text style={styles.googleBlue}>g</Text>
                  <Text style={styles.googleGreen}>l</Text>
                  <Text style={styles.googleRed}>e</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton}>
                <View style={styles.xLogo}>
                  <Text style={styles.xText}>𝕏</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[50],
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
    backgroundColor: colors.card.light,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backIcon: {
    fontSize: fontSize.lg,
    color: colors.slate[600],
    marginRight: spacing.sm,
  },
  backText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.slate[600],
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.slate[900],
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
    borderBottomColor: colors.slate[200],
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
    color: colors.slate[500],
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
    color: colors.slate[600],
    marginBottom: spacing.sm,
  },
  optionalText: {
    color: colors.slate[400],
    fontWeight: fontWeight.normal,
  },
  input: {
    height: 48,
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    color: colors.slate[900],
    borderWidth: 1,
    borderColor: colors.slate[300],
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[300],
  },
  usernamePrefix: {
    paddingLeft: spacing.md,
    fontSize: fontSize.base,
    color: colors.slate[400],
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.base,
    color: colors.slate[900],
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[300],
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    color: colors.slate[900],
  },
  eyeButton: {
    padding: spacing.md,
  },
  eyeIcon: {
    fontSize: fontSize.lg,
  },
  helperText: {
    fontSize: fontSize.xs,
    color: colors.slate[500],
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
    borderColor: colors.slate[300],
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
    color: colors.slate[600],
  },
  termsLink: {
    color: colors.primary[600],
    fontWeight: fontWeight.semibold,
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
    backgroundColor: colors.slate[200],
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: colors.slate[500],
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
    borderColor: colors.slate[200],
    backgroundColor: colors.card.light,
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
    color: '#000',
  },
});
