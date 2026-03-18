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
import { ArrowLeft, Tag } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { post } from '../../services/api';
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

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }

    if (!validate()) return;

    setLoading(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        category,
        clientName: clientName.trim() || undefined,
        projectDuration: projectDuration.trim() || undefined,
      };

      const response = await post<any>('/portfolio', data);

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
                {category || 'Seleccionar categoría'}
              </Text>
              <Text style={{ color: themeColors.text.muted }}>{showCategories ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

            {showCategories && (
              <View style={[styles.dropdown, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                  {categories.map((cat) => (
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
