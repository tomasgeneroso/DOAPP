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
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import Logo from '../../components/ui/Logo';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { colors: themeColors } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await login({ email: email.trim(), password });

      if (response.success) {
        router.replace('/(tabs)');
      } else {
        setError(response.message || 'Error al iniciar sesión');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Top Bar with Back Button */}
      <View style={styles.topBar}>
        <Link href="/(tabs)" asChild>
          <TouchableOpacity style={styles.backButton}>
            <ArrowLeft size={20} color={themeColors.text.secondary} />
            <Text style={[styles.backText, { color: themeColors.text.secondary }]}>Volver al inicio</Text>
          </TouchableOpacity>
        </Link>
      </View>

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

            {/* Title */}
            <Text style={[styles.title, { color: themeColors.text.primary }]}>Inicia sesión en tu cuenta</Text>

            {/* Promo Banner */}
            <View style={styles.promoBanner}>
              <Text style={styles.promoText}>
                ¡Los primeros 1000 usuarios tendrán servicio gratuito por un año! 🎉
              </Text>
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { borderBottomColor: themeColors.border }]}>
              <TouchableOpacity style={[styles.tab, styles.tabActive]}>
                <Text style={[styles.tabText, styles.tabTextActive]}>Iniciar Sesión</Text>
              </TouchableOpacity>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity style={styles.tab}>
                  <Text style={[styles.tabText, { color: themeColors.text.muted }]}>Registrarme</Text>
                </TouchableOpacity>
              </Link>
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
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.text.secondary }]}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                  placeholder="tucorreo@email.com"
                  placeholderTextColor={themeColors.text.muted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: themeColors.text.secondary }]}>Contraseña</Text>
                  <Link href="/(auth)/forgot-password" asChild>
                    <TouchableOpacity>
                      <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
                <View style={[styles.passwordContainer, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: themeColors.text.primary }]}
                    placeholder="••••••••"
                    placeholderTextColor={themeColors.text.muted}
                    value={password}
                    onChangeText={setPassword}
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

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Iniciar Sesión</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
              <Text style={[styles.dividerText, { color: themeColors.text.muted }]}>o continúa con</Text>
              <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
            </View>

            {/* Social Login */}
            <View style={styles.socialButtons}>
              <TouchableOpacity style={[styles.socialButton, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
                <View style={styles.googleLogo}>
                  <Text style={styles.googleBlue}>G</Text>
                  <Text style={styles.googleRed}>o</Text>
                  <Text style={styles.googleYellow}>o</Text>
                  <Text style={styles.googleBlue}>g</Text>
                  <Text style={styles.googleGreen}>l</Text>
                  <Text style={styles.googleRed}>e</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.socialButton, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
                <View style={styles.xLogo}>
                  <Text style={[styles.xText, { color: themeColors.text.primary }]}>𝕏</Text>
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
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    paddingTop: 0,
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
    gap: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
  forgotPasswordText: {
    color: colors.primary[600],
    fontSize: fontSize.sm,
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
