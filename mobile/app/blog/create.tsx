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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { upload } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

const BLOG_CATEGORIES = [
  'Limpieza',
  'Reparaciones',
  'Mantenimiento',
  'Productos Ecológicos',
  'Hogar',
  'Jardín',
  'Tips',
  'Otros',
];

export default function CreateBlogScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategories, setShowCategories] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'El título es requerido';
    else if (title.length > 200) newErrors.title = 'Máximo 200 caracteres';
    if (!subtitle.trim()) newErrors.subtitle = 'El subtítulo es requerido';
    else if (subtitle.length > 300) newErrors.subtitle = 'Máximo 300 caracteres';
    if (!content.trim()) newErrors.content = 'El contenido es requerido';
    if (!excerpt.trim()) newErrors.excerpt = 'El extracto es requerido';
    else if (excerpt.length > 500) newErrors.excerpt = 'Máximo 500 caracteres';
    if (!category) newErrors.category = 'Seleccioná una categoría';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    if (!validate()) return;

    setLoading(true);
    try {
      // Backend uses multer so we send multipart/form-data
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('subtitle', subtitle.trim());
      formData.append('content', content.trim());
      formData.append('excerpt', excerpt.trim());
      formData.append('category', category);
      formData.append('status', status);

      const response = await upload<any>('/blogs', formData);

      if (response.success) {
        Alert.alert(
          status === 'published' ? 'Artículo publicado' : 'Borrador guardado',
          status === 'published'
            ? 'Tu artículo ya está visible en el blog de la comunidad.'
            : 'Tu borrador fue guardado. Podés publicarlo desde Mis artículos.',
          [{ text: 'Ver mis artículos', onPress: () => router.replace('/blog') }]
        );
      } else {
        const errMsg = (response as any).errors
          ? (response as any).errors.map((e: any) => e.msg).join('\n')
          : response.message || 'No se pudo guardar el artículo';
        Alert.alert('Error', errMsg);
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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/blog')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Nuevo artículo
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Título *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.slate[50], borderColor: errors.title ? colors.danger[500] : themeColors.border, color: themeColors.text.primary }]}
              placeholder="Ej: Cómo organizar tu agenda como freelancer"
              placeholderTextColor={themeColors.text.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />
            <Text style={[styles.charCount, { color: themeColors.text.muted }]}>{title.length}/200</Text>
            {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
          </View>

          {/* Subtitle */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Subtítulo *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.slate[50], borderColor: errors.subtitle ? colors.danger[500] : themeColors.border, color: themeColors.text.primary }]}
              placeholder="Una frase que complemente el título"
              placeholderTextColor={themeColors.text.muted}
              value={subtitle}
              onChangeText={setSubtitle}
              maxLength={300}
            />
            <Text style={[styles.charCount, { color: themeColors.text.muted }]}>{subtitle.length}/300</Text>
            {errors.subtitle && <Text style={styles.errorText}>{errors.subtitle}</Text>}
          </View>

          {/* Excerpt */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Extracto *</Text>
            <Text style={[styles.hint, { color: themeColors.text.muted }]}>
              Resumen corto que aparece en el listado del blog
            </Text>
            <TextInput
              style={[styles.textArea, styles.textAreaShort, { backgroundColor: themeColors.slate[50], borderColor: errors.excerpt ? colors.danger[500] : themeColors.border, color: themeColors.text.primary }]}
              placeholder="Breve resumen de tu artículo (máx. 500 caracteres)"
              placeholderTextColor={themeColors.text.muted}
              value={excerpt}
              onChangeText={setExcerpt}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={[styles.charCount, { color: themeColors.text.muted }]}>{excerpt.length}/500</Text>
            {errors.excerpt && <Text style={styles.errorText}>{errors.excerpt}</Text>}
          </View>

          {/* Category */}
          <View style={[styles.inputGroup, { zIndex: 10 }]}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Categoría *</Text>
            <TouchableOpacity
              style={[styles.input, styles.selectInput, { backgroundColor: themeColors.slate[50], borderColor: errors.category ? colors.danger[500] : themeColors.border }]}
              onPress={() => setShowCategories(!showCategories)}
            >
              <Text style={[styles.selectText, { color: category ? themeColors.text.primary : themeColors.text.muted }]}>
                {category || 'Seleccionar categoría'}
              </Text>
              <Text style={{ color: themeColors.text.muted }}>{showCategories ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

            {showCategories && (
              <View style={[styles.dropdown, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                  {BLOG_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.dropdownItem, category === cat && { backgroundColor: themeColors.primary[50] }]}
                      onPress={() => { setCategory(cat); setShowCategories(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: themeColors.text.primary }, category === cat && { color: themeColors.primary[600] }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>Contenido *</Text>
            <Text style={[styles.hint, { color: themeColors.text.muted }]}>
              El cuerpo completo de tu artículo
            </Text>
            <TextInput
              style={[styles.textArea, styles.textAreaLarge, { backgroundColor: themeColors.slate[50], borderColor: errors.content ? colors.danger[500] : themeColors.border, color: themeColors.text.primary }]}
              placeholder="Escribí tu artículo acá..."
              placeholderTextColor={themeColors.text.muted}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
            {errors.content && <Text style={styles.errorText}>{errors.content}</Text>}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.draftButton, { borderColor: themeColors.primary[600] }, loading && styles.buttonDisabled]}
              onPress={() => handleSubmit('draft')}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={themeColors.primary[600]} />
              ) : (
                <Text style={[styles.draftButtonText, { color: themeColors.primary[600] }]}>Guardar borrador</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.publishButton, loading && styles.buttonDisabled]}
              onPress={() => handleSubmit('published')}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.publishButtonText}>Publicar</Text>
              )}
            </TouchableOpacity>
          </View>
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
  scrollContent: { padding: spacing.lg, paddingBottom: 50 },
  inputGroup: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  hint: { fontSize: fontSize.xs, marginBottom: spacing.sm },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
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
    elevation: 5,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
  },
  dropdownScroll: { maxHeight: 200 },
  dropdownItem: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  dropdownItemText: { fontSize: fontSize.sm },
  textArea: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  textAreaShort: { minHeight: 80 },
  textAreaLarge: { minHeight: 200 },
  charCount: { fontSize: fontSize.xs, textAlign: 'right', marginTop: spacing.xs },
  errorText: { color: colors.danger[500], fontSize: fontSize.xs, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  draftButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftButtonText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  publishButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishButtonText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  buttonDisabled: { opacity: 0.7 },
});
