import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, User, Camera, Plus, Trash2, Clock, Eye, EyeOff } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile, updateSettings } from '../services/auth';
import { upload, getImageUrl } from '../services/api';
import { AvailabilitySlot, AvailabilitySchedule } from '../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import LocationAutocomplete from '../components/ui/LocationAutocomplete';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function EditProfileScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user, refreshUser, isAuthenticated, isLoading: authLoading } = useAuth();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Availability state
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [isAvailabilityPublic, setIsAvailabilityPublic] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const availabilityDirty = useRef(false);
  const availabilitySlotsRef = useRef<AvailabilitySlot[]>([]);
  const isAvailabilityPublicRef = useRef(false);
  const availabilityLocallyModified = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }

    if (user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setBio(user.bio || '');
      setPhone(user.phone || '');
      setCity(user.address?.city || '');
      if (!availabilityLocallyModified.current) {
        const slots = user.availabilitySchedule?.slots || [];
        const isPublic = user.isAvailabilityPublic || false;
        setAvailabilitySlots(slots);
        setIsAvailabilityPublic(isPublic);
        availabilitySlotsRef.current = slots;
        isAvailabilityPublicRef.current = isPublic;
      }
    }
  }, [user, isAuthenticated, authLoading]);

  // Refresh user data on mount, reset flag on unmount
  useEffect(() => {
    refreshUser().catch(() => {});
    return () => { availabilityLocallyModified.current = false; };
  }, []);

  const handleAvatarChange = async () => {
    Alert.alert(
      'Cambiar foto',
      'Elegí de dónde querés subir tu foto',
      [
        {
          text: 'Cámara',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadAvatar(result.assets[0].uri);
            }
          },
        },
        {
          text: 'Galería',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadAvatar(result.assets[0].uri);
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const uploadAvatar = async (uri: string) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'avatar.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('avatar', { uri, name: filename, type: mimeType } as any);
      const response = await upload<any>('/users/avatar', formData);
      if (response.success) {
        setAvatarUri(uri);
        await refreshUser();
      } else {
        Alert.alert('Error', response.message || 'No se pudo subir la foto');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al subir la foto');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const getSlotsForDay = (day: number) =>
    availabilitySlots.filter((s) => s.day === day);

  const saveAvailabilityToServer = useCallback(async (slots: AvailabilitySlot[], isPublic: boolean) => {
    setSavingAvailability(true);
    try {
      await updateSettings({
        availabilitySchedule: { timezone: 'America/Argentina/Buenos_Aires', slots, exceptions: [] },
        isAvailabilityPublic: isPublic,
      });
    } catch {
      // Silent fail for auto-save
    } finally {
      setSavingAvailability(false);
    }
  }, []);

  const addSlot = (day: number) => {
    availabilityLocallyModified.current = true;
    const next = [...availabilitySlotsRef.current, { day, start: '09:00', end: '18:00' }];
    availabilitySlotsRef.current = next;
    setAvailabilitySlots(next);
    saveAvailabilityToServer(next, isAvailabilityPublicRef.current);
  };

  const removeSlot = (day: number, index: number) => {
    availabilityLocallyModified.current = true;
    const dayIndexes: number[] = [];
    availabilitySlotsRef.current.forEach((s, i) => { if (s.day === day) dayIndexes.push(i); });
    const globalIndex = dayIndexes[index];
    const next = availabilitySlotsRef.current.filter((_, i) => i !== globalIndex);
    availabilitySlotsRef.current = next;
    setAvailabilitySlots(next);
    saveAvailabilityToServer(next, isAvailabilityPublicRef.current);
  };

  const updateSlotTime = (day: number, slotIndex: number, field: 'start' | 'end', value: string) => {
    availabilityLocallyModified.current = true;
    availabilityDirty.current = true;
    const filtered = value.replace(/[^0-9:]/g, '').slice(0, 5);
    const dayIndexes: number[] = [];
    availabilitySlotsRef.current.forEach((s, i) => { if (s.day === day) dayIndexes.push(i); });
    const globalIndex = dayIndexes[slotIndex];
    const next = availabilitySlotsRef.current.map((s, i) => (i === globalIndex ? { ...s, [field]: filtered } : s));
    availabilitySlotsRef.current = next;
    setAvailabilitySlots(next);
  };

  const toggleAvailabilityPublic = (val: boolean) => {
    availabilityLocallyModified.current = true;
    isAvailabilityPublicRef.current = val;
    setIsAvailabilityPublic(val);
    saveAvailabilityToServer(availabilitySlotsRef.current, val);
  };

  // Debounce save for time input changes only
  useEffect(() => {
    if (!availabilityDirty.current) return;
    const timer = setTimeout(async () => {
      setSavingAvailability(true);
      try {
        await updateSettings({
          availabilitySchedule: { timezone: 'America/Argentina/Buenos_Aires', slots: availabilitySlotsRef.current, exceptions: [] },
          isAvailabilityPublic: isAvailabilityPublicRef.current,
        });
      } catch {
        // Silent fail
      } finally {
        availabilityDirty.current = false;
        setSavingAvailability(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [availabilitySlots]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'El nombre es requerido');
      return;
    }

    setLoading(true);
    try {
      const response = await updateProfile({
        name: name.trim(),
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
        phone: phone.trim() || undefined,
        address: city.trim() ? { city: city.trim() } : undefined,
      });

      if (response.success) {
        await refreshUser();
        Alert.alert('Perfil actualizado', 'Los cambios han sido guardados', [
          { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile') },
        ]);
      } else {
        Alert.alert('Error', response.message || 'No se pudo actualizar el perfil');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Editar perfil
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading}
          style={styles.saveButton}
        >
          {loading ? (
            <ActivityIndicator size="small" color={themeColors.primary[600]} />
          ) : (
            <Text style={[styles.saveButtonText, { color: themeColors.primary[600] }]}>
              Guardar
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: themeColors.slate[100] }]}>
              {avatarUri || user?.avatar ? (
                <Image
                  source={{ uri: avatarUri || getImageUrl(user?.avatar) || '' }}
                  style={styles.avatarImage}
                />
              ) : (
                <User size={40} color={themeColors.text.secondary} />
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.changeAvatarButton, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
              onPress={handleAvatarChange}
              disabled={uploadingAvatar}
            >
              <Camera size={16} color={themeColors.primary[600]} />
              <Text style={[styles.changeAvatarText, { color: themeColors.primary[600] }]}>
                {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Nombre *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Tu nombre completo"
                placeholderTextColor={themeColors.text.muted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Usuario
              </Text>
              <View
                style={[
                  styles.usernameContainer,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Text style={[styles.usernamePrefix, { color: themeColors.text.muted }]}>@</Text>
                <TextInput
                  style={[styles.usernameInput, { color: themeColors.text.primary }]}
                  placeholder="usuario"
                  placeholderTextColor={themeColors.text.muted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Biografía
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Cuéntanos sobre ti..."
                placeholderTextColor={themeColors.text.muted}
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={[styles.charCount, { color: themeColors.text.muted }]}>
                {bio.length}/500
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Teléfono
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="+54 11 1234-5678"
                placeholderTextColor={themeColors.text.muted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={[styles.inputGroup, { zIndex: 10 }]}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Ciudad
              </Text>
              <LocationAutocomplete
                value={city}
                onChangeText={setCity}
                placeholder="Ej: Córdoba Capital, Córdoba"
                themeColors={themeColors}
              />
            </View>
          </View>

          {/* Email (read-only) */}
          <View style={[styles.infoCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.infoLabel, { color: themeColors.text.muted }]}>
              Email
            </Text>
            <Text style={[styles.infoValue, { color: themeColors.text.primary }]}>
              {user?.email}
            </Text>
            <TouchableOpacity onPress={() => router.push('/settings?tab=email')}>
              <Text style={[styles.infoHint, { color: themeColors.primary[600] }]}>
                ¿Querés cambiar tu email? Solicitalo al soporte →
              </Text>
            </TouchableOpacity>
          </View>

          {/* Availability Schedule */}
          <View style={[styles.availabilitySection, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.availabilityHeader}>
              <View style={styles.availabilityTitleRow}>
                <Clock size={20} color={themeColors.primary[600]} />
                <Text style={[styles.availabilityTitle, { color: themeColors.text.primary }]}>
                  Disponibilidad
                </Text>
              </View>
              <View style={styles.publicToggle}>
                {isAvailabilityPublic ? (
                  <Eye size={16} color={colors.success[500]} />
                ) : (
                  <EyeOff size={16} color={themeColors.text.muted} />
                )}
                <Text style={[styles.publicToggleText, { color: themeColors.text.secondary }]}>
                  {isAvailabilityPublic ? 'Pública' : 'Privada'}
                </Text>
                <Switch
                  value={isAvailabilityPublic}
                  onValueChange={toggleAvailabilityPublic}
                  trackColor={{ false: themeColors.slate[200], true: colors.primary[400] }}
                  thumbColor={isAvailabilityPublic ? colors.primary[600] : themeColors.slate[50]}
                />
              </View>
            </View>

            <Text style={[styles.availabilityHint, { color: themeColors.text.muted }]}>
              Seleccioná un día para configurar tus horarios
            </Text>

            {/* Day selector */}
            <View style={styles.daySelector}>
              {DAY_NAMES.map((name, index) => {
                const hasSlots = getSlotsForDay(index).length > 0;
                const isSelected = selectedDay === index;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dayButton,
                      {
                        backgroundColor: isSelected
                          ? colors.primary[600]
                          : hasSlots
                          ? colors.primary[50]
                          : themeColors.slate[100],
                        borderColor: isSelected ? colors.primary[600] : hasSlots ? colors.primary[300] : themeColors.border,
                      },
                    ]}
                    onPress={() => setSelectedDay(isSelected ? null : index)}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        {
                          color: isSelected ? '#fff' : hasSlots ? colors.primary[700] : themeColors.text.secondary,
                        },
                      ]}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Slots for selected day */}
            {selectedDay !== null && (
              <View style={styles.slotsContainer}>
                <View style={styles.slotsDayHeader}>
                  <Text style={[styles.slotsDayTitle, { color: themeColors.text.primary }]}>
                    {DAY_NAMES_FULL[selectedDay]}
                  </Text>
                  <TouchableOpacity
                    style={[styles.addSlotButton, { backgroundColor: colors.primary[50] }]}
                    onPress={() => addSlot(selectedDay)}
                  >
                    <Plus size={16} color={colors.primary[600]} />
                    <Text style={styles.addSlotText}>Agregar</Text>
                  </TouchableOpacity>
                </View>

                {getSlotsForDay(selectedDay).length === 0 ? (
                  <Text style={[styles.noSlotsText, { color: themeColors.text.muted }]}>
                    Sin horarios configurados
                  </Text>
                ) : (
                  getSlotsForDay(selectedDay).map((slot, i) => (
                    <View key={i} style={[styles.slotRow, { borderColor: themeColors.border }]}>
                      <TextInput
                        style={[styles.timeInput, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                        value={slot.start}
                        onChangeText={(v) => updateSlotTime(selectedDay, i, 'start', v)}
                        placeholder="09:00"
                        placeholderTextColor={themeColors.text.muted}
                        keyboardType="numeric"
                        maxLength={5}
                      />
                      <Text style={[styles.slotDash, { color: themeColors.text.secondary }]}>a</Text>
                      <TextInput
                        style={[styles.timeInput, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                        value={slot.end}
                        onChangeText={(v) => updateSlotTime(selectedDay, i, 'end', v)}
                        placeholder="18:00"
                        placeholderTextColor={themeColors.text.muted}
                        keyboardType="numeric"
                        maxLength={5}
                      />
                      <TouchableOpacity
                        style={styles.removeSlotButton}
                        onPress={() => removeSlot(selectedDay, i)}
                      >
                        <Trash2 size={18} color={colors.danger[500]} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Auto-save indicator */}
            {savingAvailability && (
              <View style={styles.autoSaveIndicator}>
                <ActivityIndicator color={colors.primary[500]} size="small" />
                <Text style={[styles.autoSaveText, { color: themeColors.text.secondary }]}>Guardando...</Text>
              </View>
            )}
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
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: fontWeight.bold,
    color: colors.primary[600],
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarOverlay: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  changeAvatarText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  form: {
    gap: spacing.lg,
  },
  inputGroup: {
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
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  usernamePrefix: {
    fontSize: fontSize.base,
    marginRight: spacing.xs,
  },
  usernameInput: {
    flex: 1,
    fontSize: fontSize.base,
    height: '100%',
  },
  textArea: {
    minHeight: 100,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  charCount: {
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  infoCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginTop: spacing.xl,
  },
  infoLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  infoValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  infoHint: {
    fontSize: fontSize.xs,
  },
  availabilitySection: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginTop: spacing.xl,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  availabilityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  availabilityTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  publicToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  publicToggleText: {
    fontSize: fontSize.xs,
  },
  availabilityHint: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  daySelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.md,
  },
  dayButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dayButtonText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  slotsContainer: {
    marginBottom: spacing.md,
  },
  slotsDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  slotsDayTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  addSlotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  addSlotText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.primary[600],
  },
  noSlotsText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  timeInput: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  slotDash: {
    fontSize: fontSize.sm,
  },
  removeSlotButton: {
    padding: spacing.xs,
  },
  autoSaveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  autoSaveText: {
    fontSize: fontSize.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
