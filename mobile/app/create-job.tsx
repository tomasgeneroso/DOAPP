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
import {
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  Tag,
  Users,
  CheckCircle,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { createJob, getCategories } from '../services/jobs';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

export default function CreateJobScreen() {
  const router = useRouter();
  const { isDarkMode, colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const categories = getCategories();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endDateFlexible, setEndDateFlexible] = useState(false);
  const [maxWorkers, setMaxWorkers] = useState('1');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategories, setShowCategories] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'El título es requerido';
    if (!description.trim()) newErrors.description = 'La descripción es requerida';
    if (!category) newErrors.category = 'Selecciona una categoría';
    if (!price || isNaN(parseFloat(price))) newErrors.price = 'Ingresa un precio válido';
    if (parseFloat(price) < 1000) newErrors.price = 'El precio mínimo es $1,000 ARS';
    if (!location.trim()) newErrors.location = 'La ubicación es requerida';
    if (!startDate.trim()) newErrors.startDate = 'La fecha de inicio es requerida';

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
      const jobData = {
        title: title.trim(),
        description: description.trim(),
        category,
        price: parseFloat(price),
        budget: parseFloat(price),
        location: location.trim(),
        neighborhood: neighborhood.trim() || undefined,
        startDate,
        endDate: endDateFlexible ? undefined : endDate || undefined,
        endDateFlexible,
        maxWorkers: parseInt(maxWorkers) || 1,
      };

      const response = await createJob(jobData);

      if (response.success && response.data) {
        Alert.alert(
          'Trabajo creado',
          'Tu trabajo ha sido creado. Ahora debes pagar la publicación para que sea visible.',
          [
            {
              text: 'Ver trabajo',
              onPress: () => router.replace(`/job/${response.data!.job._id}`),
            },
          ]
        );
      } else {
        Alert.alert('Error', response.message || 'No se pudo crear el trabajo');
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Publicar trabajo
        </Text>
        <View style={{ width: 40 }} />
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
          {/* Info Banner */}
          <View style={[styles.infoBanner, { backgroundColor: themeColors.primary[50] }]}>
            <Text style={[styles.infoBannerText, { color: themeColors.primary[600] }]}>
              Los trabajos requieren el pago de una comisión para ser publicados.
              Tu dinero estará protegido en escrow hasta que el trabajo se complete.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <FileText size={16} color={themeColors.text.secondary} /> Título *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.title ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Ej: Limpieza de departamento 2 ambientes"
                placeholderTextColor={themeColors.text.muted}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
            </View>

            {/* Category */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Tag size={16} color={themeColors.text.secondary} /> Categoría *
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.selectInput,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.category ? colors.danger[500] : themeColors.border,
                  },
                ]}
                onPress={() => setShowCategories(!showCategories)}
              >
                <Text
                  style={{
                    color: category ? themeColors.text.primary : themeColors.text.muted,
                    fontSize: fontSize.base,
                  }}
                >
                  {category || 'Selecciona una categoría'}
                </Text>
              </TouchableOpacity>
              {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

              {showCategories && (
                <View style={[styles.categoriesList, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryItem,
                        category === cat && { backgroundColor: themeColors.primary[50] },
                      ]}
                      onPress={() => {
                        setCategory(cat);
                        setShowCategories(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.categoryItemText,
                          { color: category === cat ? themeColors.primary[600] : themeColors.text.primary },
                        ]}
                      >
                        {cat}
                      </Text>
                      {category === cat && <CheckCircle size={18} color={themeColors.primary[600]} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Descripción *
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.description ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Describe el trabajo en detalle. Incluye requisitos específicos, herramientas necesarias, etc."
                placeholderTextColor={themeColors.text.muted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            {/* Price */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <DollarSign size={16} color={themeColors.text.secondary} /> Precio (ARS) *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.price ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Ej: 15000"
                placeholderTextColor={themeColors.text.muted}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
              <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                Precio mínimo: $1,000 ARS
              </Text>
              {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
            </View>

            {/* Location */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <MapPin size={16} color={themeColors.text.secondary} /> Ciudad/Localidad *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.location ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Ej: Buenos Aires"
                placeholderTextColor={themeColors.text.muted}
                value={location}
                onChangeText={setLocation}
              />
              {errors.location && <Text style={styles.errorText}>{errors.location}</Text>}
            </View>

            {/* Neighborhood */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Barrio (opcional)
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
                placeholder="Ej: Palermo"
                placeholderTextColor={themeColors.text.muted}
                value={neighborhood}
                onChangeText={setNeighborhood}
              />
            </View>

            {/* Start Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Calendar size={16} color={themeColors.text.secondary} /> Fecha de inicio *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.startDate ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={themeColors.text.muted}
                value={startDate}
                onChangeText={setStartDate}
              />
              {errors.startDate && <Text style={styles.errorText}>{errors.startDate}</Text>}
            </View>

            {/* End Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Fecha de fin
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
                placeholder="DD/MM/AAAA"
                placeholderTextColor={themeColors.text.muted}
                value={endDate}
                onChangeText={setEndDate}
                editable={!endDateFlexible}
              />

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setEndDateFlexible(!endDateFlexible)}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: themeColors.border,
                      backgroundColor: endDateFlexible ? themeColors.primary[600] : 'transparent',
                    },
                  ]}
                >
                  {endDateFlexible && <CheckCircle size={14} color="#fff" />}
                </View>
                <Text style={[styles.checkboxLabel, { color: themeColors.text.secondary }]}>
                  Fecha de fin flexible
                </Text>
              </TouchableOpacity>
            </View>

            {/* Max Workers */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Users size={16} color={themeColors.text.secondary} /> Trabajadores máximos
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
                placeholder="1"
                placeholderTextColor={themeColors.text.muted}
                value={maxWorkers}
                onChangeText={setMaxWorkers}
                keyboardType="numeric"
              />
              <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                Para trabajos que requieren múltiples personas
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Crear trabajo</Text>
              )}
            </TouchableOpacity>
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  infoBanner: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
  },
  infoBannerText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  selectInput: {
    justifyContent: 'center',
  },
  textArea: {
    minHeight: 120,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  helperText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.danger[500],
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  categoriesList: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    maxHeight: 250,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  categoryItemText: {
    fontSize: fontSize.base,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: fontSize.sm,
  },
  submitButton: {
    height: 52,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
