import { useState } from 'react';
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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Tag, Camera, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { upload, post } from '../../services/api';
import { getCategories } from '../../services/jobs';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function AddPortfolioScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const categories = getCategories();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectDuration, setProjectDuration] = useState('');
  const [images, setImages] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategories, setShowCategories] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'El título es requerido';
    if (!description.trim()) newErrors.description = 'La descripción es requerida';
    if (!category) newErrors.category = 'Selecciona una categoría';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.slice(0, 5 - images.length).map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      }));
      setImages((prev) => [...prev, ...newImages].slice(0, 5));
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }

    if (!validate()) return;

    setLoading(true);
    try {
      let response: any;

      if (images.length > 0) {
        const formData = new FormData();
        formData.append('title', title.trim());
        formData.append('description', description.trim());
        formData.append('category', category);
        if (clientName.trim()) formData.append('clientName', clientName.trim());
        if (projectDuration.trim()) formData.append('projectDuration', projectDuration.trim());
        images.forEach((img) => {
          formData.append('images', { uri: img.uri, name: img.name, type: img.type } as any);
        });
        response = await upload<any>('/portfolio', formData);
      } else {
        response = await post<any>('/portfolio', {
          title: title.trim(),
          description: description.trim(),
          category,
          clientName: clientName.trim() || undefined,
          projectDuration: projectDuration.trim() || undefined,
        });
      }

      if (response.success) {
        Alert.alert(
          'Portfolio actualizado',
          'Tu trabajo se agregó al portfolio exitosamente.',
          [{ text: 'Ver portfolio', onPress: () => router.replace('/portfolio') }]
        );
      } else {
        Alert.alert('Error', response.message || 'No se pudo agregar al portfolio');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/portfolio')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Agregar al portfolio
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photos */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Fotos <Text style={{ color: themeColors.text.muted, fontWeight: '400' }}>(opcional, máx. 5)</Text>
            </Text>
            <View style={styles.imagesRow}>
              {images.map((img, index) => (
                <View key={index} style={styles.imageThumbContainer}>
                  <Image source={{ uri: img.uri }} style={styles.imageThumb} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
                    <X size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 5 && (
                <TouchableOpacity
                  style={[styles.addImageBtn, { backgroundColor: themeColors.slate[100], borderColor: themeColors.border }]}
                  onPress={pickImage}
                >
                  <Camera size={24} color={themeColors.text.muted} />
                  <Text style={[styles.addImageText, { color: themeColors.text.muted }]}>Agregar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Título *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.slate[50], borderColor: errors.title ? colors.danger[500] : themeColors.border, color: themeColors.text.primary }]}
              placeholder="Ej: Instalación eléctrica completa"
              placeholderTextColor={themeColors.text.muted}
              value={title}
              onChangeText={setTitle}
            />
            {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Descripción *</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: themeColors.slate[50], borderColor: errors.description ? colors.danger[500] : themeColors.border, color: themeColors.text.primary }]}
              placeholder="Describí el trabajo que realizaste..."
              placeholderTextColor={themeColors.text.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
          </View>

          {/* Category */}
          <View style={[styles.inputGroup, { zIndex: 10 }]}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              <Tag size={16} color={themeColors.text.secondary} /> Categoría *
            </Text>
            <TouchableOpacity
              style={[styles.input, styles.selectInput, { backgroundColor: themeColors.slate[50], borderColor: errors.category ? colors.danger[500] : themeColors.border }]}
              onPress={() => setShowCategories(!showCategories)}
            >
              <Text style={[styles.selectText, { color: category ? themeColors.text.primary : themeColors.text.muted }]}>
                {category ? (() => { const c = categories.find(x => x.id === category); return c ? `${c.icon} ${c.label}` : category; })() : 'Seleccionar categoría'}
              </Text>
              <Text style={{ color: themeColors.text.muted }}>{showCategories ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

            {showCategories && (
              <View style={[styles.dropdown, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.dropdownItem, category === cat.id && { backgroundColor: themeColors.primary[50] }]}
                      onPress={() => { setCategory(cat.id); setShowCategories(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: themeColors.text.primary }, category === cat.id && { color: themeColors.primary[600] }]}>
                        {cat.icon} {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Client Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Cliente <Text style={{ color: themeColors.text.muted, fontWeight: '400' }}>(opcional)</Text>
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
              placeholder="Nombre del cliente"
              placeholderTextColor={themeColors.text.muted}
              value={clientName}
              onChangeText={setClientName}
            />
          </View>

          {/* Project Duration */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Duración <Text style={{ color: themeColors.text.muted, fontWeight: '400' }}>(opcional)</Text>
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
              placeholder="Ej: 2 semanas"
              placeholderTextColor={themeColors.text.muted}
              value={projectDuration}
              onChangeText={setProjectDuration}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Agregar al portfolio</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: { padding: spacing.xs },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  inputGroup: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 100,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontSize: fontSize.base },
  dropdown: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: 4,
    maxHeight: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  dropdownScroll: { maxHeight: 200 },
  dropdownItem: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  dropdownItemText: { fontSize: fontSize.sm },
  errorText: { color: colors.danger[500], fontSize: fontSize.xs, marginTop: spacing.xs },
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imageThumbContainer: { position: 'relative', width: 80, height: 80 },
  imageThumb: { width: 80, height: 80, borderRadius: borderRadius.md },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageBtn: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addImageText: { fontSize: fontSize.xs },
  button: {
    height: 48,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
