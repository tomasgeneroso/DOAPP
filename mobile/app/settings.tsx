import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
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
  Building2,
  MapPin,
  Save,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { updateSettings } from '../services/auth';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

type SettingsTab = 'general' | 'banking' | 'address';

export default function SettingsScreen() {
  const router = useRouter();
  const { isDarkMode, themeMode, setThemeMode, colors: themeColors } = useTheme();
  const { logout, user, refreshUser } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);

  const [notifications, setNotifications] = useState({
    push: true,
    email: true,
    messages: true,
    jobs: true,
    contracts: true,
  });

  // Banking info
  const [bankingInfo, setBankingInfo] = useState({
    cbu: user?.bankingInfo?.cbu || '',
    alias: user?.bankingInfo?.alias || '',
    bankName: user?.bankingInfo?.bankName || '',
    accountHolder: user?.bankingInfo?.accountHolder || '',
    accountType: user?.bankingInfo?.accountType || 'savings',
  });

  // Address
  const [address, setAddress] = useState({
    street: user?.address?.street || '',
    city: user?.address?.city || '',
    state: user?.address?.state || '',
    postalCode: user?.address?.postalCode || '',
    country: user?.address?.country || 'Argentina',
  });

  const saveBankingInfo = async () => {
    if (bankingInfo.cbu && bankingInfo.cbu.length !== 22) {
      Alert.alert('Error', 'El CBU debe tener 22 digitos');
      return;
    }
    setSaving(true);
    try {
      const res = await updateSettings({ bankingInfo });
      if (res.success) {
        if (refreshUser) await refreshUser();
        Alert.alert('Guardado', 'Informacion bancaria actualizada');
      } else {
        Alert.alert('Error', (res as any).message || 'No se pudo guardar');
      }
    } catch {
      Alert.alert('Error', 'Error de conexion');
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async () => {
    setSaving(true);
    try {
      const res = await updateSettings({ address });
      if (res.success) {
        if (refreshUser) await refreshUser();
        Alert.alert('Guardado', 'Direccion actualizada');
      } else {
        Alert.alert('Error', (res as any).message || 'No se pudo guardar');
      }
    } catch {
      Alert.alert('Error', 'Error de conexion');
    } finally {
      setSaving(false);
    }
  };

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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Configuración
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Selector */}
      <View style={[styles.tabRow, { borderBottomColor: themeColors.border }]}>
        {([
          { key: 'general' as SettingsTab, label: 'General' },
          { key: 'banking' as SettingsTab, label: 'Bancaria' },
          { key: 'address' as SettingsTab, label: 'Direccion' },
        ]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && { borderBottomColor: colors.primary[600] }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.key ? colors.primary[600] : themeColors.text.muted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banking Tab */}
        {activeTab === 'banking' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>Informacion bancaria</Text>
            <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>CBU (22 digitos)</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={bankingInfo.cbu}
                  onChangeText={(v) => setBankingInfo({ ...bankingInfo, cbu: v.replace(/\D/g, '').slice(0, 22) })}
                  keyboardType="numeric"
                  placeholder="0000000000000000000000"
                  placeholderTextColor={themeColors.text.muted}
                  maxLength={22}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Alias</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={bankingInfo.alias}
                  onChangeText={(v) => setBankingInfo({ ...bankingInfo, alias: v })}
                  placeholder="mi.alias.mp"
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Nombre del banco</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={bankingInfo.bankName}
                  onChangeText={(v) => setBankingInfo({ ...bankingInfo, bankName: v })}
                  placeholder="Mercado Pago, Brubank, etc."
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Titular de la cuenta</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={bankingInfo.accountHolder}
                  onChangeText={(v) => setBankingInfo({ ...bankingInfo, accountHolder: v })}
                  placeholder="Nombre completo"
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary[600] }, saving && { opacity: 0.6 }]}
                onPress={saveBankingInfo}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Save size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Guardar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Address Tab */}
        {activeTab === 'address' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>Direccion</Text>
            <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Calle y numero</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={address.street}
                  onChangeText={(v) => setAddress({ ...address, street: v })}
                  placeholder="Av. Corrientes 1234"
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Ciudad</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={address.city}
                  onChangeText={(v) => setAddress({ ...address, city: v })}
                  placeholder="Buenos Aires"
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Provincia</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={address.state}
                  onChangeText={(v) => setAddress({ ...address, state: v })}
                  placeholder="CABA"
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>Codigo postal</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                  value={address.postalCode}
                  onChangeText={(v) => setAddress({ ...address, postalCode: v })}
                  placeholder="C1043"
                  placeholderTextColor={themeColors.text.muted}
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary[600] }, saving && { opacity: 0.6 }]}
                onPress={saveAddress}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Save size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Guardar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'general' && <>
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
        <View style={styles.versionContainer}>
          <Text style={[styles.version, { color: themeColors.text.muted }]}>
            DoApp v{Constants.expoConfig?.version || '2.0.0'}
          </Text>
          <Text style={[styles.versionDetail, { color: themeColors.text.muted }]}>
            {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'} • Expo {Constants.expoConfig?.sdkVersion || ''}
          </Text>
        </View>
        </>}
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
  versionContainer: {
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: 4,
  },
  version: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  versionDetail: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  inputGroup: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
