import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bell,
  Moon,
  Shield,
  HelpCircle,
  FileText,
  LogOut,
  ChevronRight,
  Smartphone,
  Mail,
  Lock,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { isDarkMode, themeMode, setThemeMode, colors: themeColors } = useTheme();
  const { logout } = useAuth();

  const [notifications, setNotifications] = useState({
    push: true,
    email: true,
    messages: true,
    jobs: true,
    contracts: true,
  });

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es irreversible. ¿Estás seguro de que quieres eliminar tu cuenta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Contactar soporte', 'Para eliminar tu cuenta, contacta a soporte@doapp.com');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Configuración
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>
            Apariencia
          </Text>
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Moon size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Modo oscuro
                </Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={() => setThemeMode(isDarkMode ? 'light' : 'dark')}
                trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Alert.alert(
                  'Tema',
                  'Selecciona el tema de la aplicación',
                  [
                    { text: 'Claro', onPress: () => setThemeMode('light') },
                    { text: 'Oscuro', onPress: () => setThemeMode('dark') },
                    { text: 'Sistema', onPress: () => setThemeMode('system') },
                  ]
                );
              }}
            >
              <View style={styles.settingLeft}>
                <Smartphone size={20} color={themeColors.text.secondary} />
                <View>
                  <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                    Seguir tema del sistema
                  </Text>
                  <Text style={[styles.settingValue, { color: themeColors.text.muted }]}>
                    {themeMode === 'system' ? 'Activado' : 'Desactivado'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={themeColors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>
            Notificaciones
          </Text>
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Bell size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Notificaciones push
                </Text>
              </View>
              <Switch
                value={notifications.push}
                onValueChange={(value) => setNotifications({ ...notifications, push: value })}
                trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Mail size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Notificaciones por email
                </Text>
              </View>
              <Switch
                value={notifications.email}
                onValueChange={(value) => setNotifications({ ...notifications, email: value })}
                trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={[styles.settingLabel, { color: themeColors.text.primary, marginLeft: 28 }]}>
                  Mensajes nuevos
                </Text>
              </View>
              <Switch
                value={notifications.messages}
                onValueChange={(value) => setNotifications({ ...notifications, messages: value })}
                trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={[styles.settingLabel, { color: themeColors.text.primary, marginLeft: 28 }]}>
                  Actualizaciones de trabajos
                </Text>
              </View>
              <Switch
                value={notifications.jobs}
                onValueChange={(value) => setNotifications({ ...notifications, jobs: value })}
                trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={[styles.settingLabel, { color: themeColors.text.primary, marginLeft: 28 }]}>
                  Actualizaciones de contratos
                </Text>
              </View>
              <Switch
                value={notifications.contracts}
                onValueChange={(value) => setNotifications({ ...notifications, contracts: value })}
                trackColor={{ false: colors.slate[300], true: colors.primary[600] }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>
            Seguridad
          </Text>
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Cambiar contraseña', 'Próximamente')}
            >
              <View style={styles.settingLeft}>
                <Lock size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Cambiar contraseña
                </Text>
              </View>
              <ChevronRight size={20} color={themeColors.text.muted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Autenticación de dos factores', 'Próximamente')}
            >
              <View style={styles.settingLeft}>
                <Shield size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Autenticación de dos factores
                </Text>
              </View>
              <ChevronRight size={20} color={themeColors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Help */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>
            Ayuda
          </Text>
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/help')}
            >
              <View style={styles.settingLeft}>
                <HelpCircle size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Centro de ayuda
                </Text>
              </View>
              <ChevronRight size={20} color={themeColors.text.muted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Términos de servicio', 'Próximamente')}
            >
              <View style={styles.settingLeft}>
                <FileText size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Términos de servicio
                </Text>
              </View>
              <ChevronRight size={20} color={themeColors.text.muted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert('Política de privacidad', 'Próximamente')}
            >
              <View style={styles.settingLeft}>
                <FileText size={20} color={themeColors.text.secondary} />
                <Text style={[styles.settingLabel, { color: themeColors.text.primary }]}>
                  Política de privacidad
                </Text>
              </View>
              <ChevronRight size={20} color={themeColors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>
            Cuenta
          </Text>
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <TouchableOpacity style={styles.settingRow} onPress={handleLogout}>
              <View style={styles.settingLeft}>
                <LogOut size={20} color={colors.danger[500]} />
                <Text style={[styles.settingLabel, { color: colors.danger[500] }]}>
                  Cerrar sesión
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity style={styles.settingRow} onPress={handleDeleteAccount}>
              <View style={styles.settingLeft}>
                <Trash2 size={20} color={colors.danger[500]} />
                <Text style={[styles.settingLabel, { color: colors.danger[500] }]}>
                  Eliminar cuenta
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Version */}
        <Text style={[styles.version, { color: themeColors.text.muted }]}>
          DoApp v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  settingLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  settingValue: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 28,
  },
  version: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
