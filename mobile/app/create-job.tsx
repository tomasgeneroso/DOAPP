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
  Linking,
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
import { createJob, createJobPaymentOrder, getCategories } from '../services/jobs';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import LocationAutocomplete from '../components/ui/LocationAutocomplete';

export default function CreateJobScreen() {
  const router = useRouter();
  const { isDarkMode, colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

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

  // Validate DD/MM/YYYY date and check it's a real future date
  const isValidDate = (dateStr: string): boolean => {
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;
    const [, dd, mm, yyyy] = match;
    const day = parseInt(dd), month = parseInt(mm), year = parseInt(yyyy);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2024 || year > 2100) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };

  // Auto-format date input: add "/" after DD and MM
  // Simple date filter: only allow digits and slashes, max 10 chars
  const handleDateInput = (text: string, setter: (v: string) => void) => {
    const cleaned = text.replace(/[^\d/]/g, '').substring(0, 10);
    setter(cleaned);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'El título es requerido';
    if (!description.trim()) newErrors.description = 'La descripción es requerida';
    if (!category) newErrors.category = 'Selecciona una categoría';
    if (!price || isNaN(parseFloat(price))) newErrors.price = 'Ingresa un precio válido';
    else if (parseFloat(price) < 1000) newErrors.price = 'El precio mínimo es $1,000 ARS';
    else if (parseFloat(price) > 999999999) newErrors.price = 'El precio máximo es $999,999,999 ARS';
    if (!location.trim()) newErrors.location = 'La ubicación es requerida';
    if (!startDate.trim()) newErrors.startDate = 'La fecha de inicio es requerida';
    else if (!isValidDate(startDate)) newErrors.startDate = 'Fecha inválida. Usá formato DD/MM/AAAA (ej: 25/03/2026)';
    if (endDate && !endDateFlexible && !isValidDate(endDate)) newErrors.endDate = 'Fecha inválida. Usá formato DD/MM/AAAA';

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
      const desc = description.trim();
      // Convert DD/MM/YYYY to ISO 8601 (YYYY-MM-DD)
      const toISO = (dateStr: string): string => {
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return dateStr; // Already ISO or other format
      };
      const jobData = {
        title: title.trim(),
        summary: desc.length > 150 ? desc.substring(0, 150) + '...' : desc,
        description: desc,
        category,
        price: parseFloat(price),
        budget: parseFloat(price),
        location: location.trim(),
        neighborhood: neighborhood.trim() || undefined,
        startDate: toISO(startDate),
        endDate: endDateFlexible ? undefined : (endDate ? toISO(endDate) : undefined),
        endDateFlexible,
        maxWorkers: parseInt(maxWorkers) || 1,
      };

      const response = await createJob(jobData);

      // Backend returns job at root level, not under data
      const job = response.data?.job || (response as any).job;
      const requiresPayment = (response as any).requiresPayment;

      // Helper: works on both web and native
      const showAlert = (title: string, message: string, onOk?: () => void) => {
        if (Platform.OS === 'web') {
          window.alert(`${title}\n\n${message}`);
          onOk?.();
        } else {
          Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
        }
      };

      const openUrl = (url: string) => {
        if (Platform.OS === 'web') {
          window.open(url, '_blank') || (window.location.href = url);
        } else {
          Linking.openURL(url);
        }
      };

      if (response.success && job) {
        if (requiresPayment === false) {
          // Job published for free (user has free contracts)
          showAlert('Trabajo publicado', 'Tu trabajo ha sido publicado exitosamente.', () => {
            router.replace(`/job/${job.id || job._id}`);
          });
        } else {
          // Job created as draft, needs payment

          try {
            const paymentResponse = await createJobPaymentOrder(job.id || job._id, 'mercadopago');


            if (paymentResponse.success && (paymentResponse as any).requiresPayment === false) {
              // Free contract detected at payment step
              showAlert('Trabajo publicado', 'Tu trabajo ha sido publicado con un contrato gratuito.', () => {
                router.replace(`/job/${job.id || job._id}`);
              });
            } else if (paymentResponse.success && (paymentResponse as any).approvalUrl) {
              // Open MercadoPago checkout
              const checkoutUrl = (paymentResponse as any).approvalUrl;
              const amount = (paymentResponse as any).amount;


              if (Platform.OS === 'web') {
                const proceed = window.confirm(
                  `Pago requerido\n\nPara publicar tu trabajo necesitás pagar $${amount?.toLocaleString('es-AR') || ''} ARS.\n\n¿Abrir MercadoPago para completar el pago?`
                );
                if (proceed) {
                  openUrl(checkoutUrl);
                }
              } else {
                Alert.alert(
                  'Pago requerido',
                  `Para publicar tu trabajo necesitás pagar $${amount?.toLocaleString('es-AR') || ''} ARS.`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Pagar con MercadoPago', onPress: () => openUrl(checkoutUrl) },
                  ]
                );
              }
            } else {
              // No approvalUrl in payment response
              showAlert('Trabajo creado', 'Tu trabajo fue creado pero requiere pago para ser publicado.', () => {
                router.replace('/(tabs)');
              });
            }
          } catch (payError: any) {
            console.error('Payment error:', payError.message);
            showAlert('Trabajo creado', 'Tu trabajo fue creado pero hubo un error al procesar el pago.', () => {
              router.replace(`/job/${job.id || job._id}`);
            });
          }
        }
      } else {
        showAlert('Error', (response as any).message || 'No se pudo crear el trabajo');
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
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
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
              Una vez publicado, tu dinero estará protegido en la plataforma hasta que el trabajo se complete.
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
            <View style={[styles.inputGroup, { zIndex: 20 }]}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <MapPin size={16} color={themeColors.text.secondary} /> Ciudad/Localidad *
              </Text>
              <LocationAutocomplete
                value={location}
                onChangeText={setLocation}
                placeholder="Ej: Córdoba Capital, Córdoba"
                error={errors.location}
                themeColors={themeColors}
              />
            </View>

            {/* Neighborhood */}
            <View style={[styles.inputGroup, { zIndex: 10 }]}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Barrio (opcional)
              </Text>
              <LocationAutocomplete
                value={neighborhood}
                onChangeText={setNeighborhood}
                placeholder="Ej: Palermo"
                themeColors={themeColors}
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
                onChangeText={(t) => handleDateInput(t, setStartDate)}
                keyboardType="numeric"
                maxLength={10}
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
                onChangeText={(t) => handleDateInput(t, setEndDate)}
                keyboardType="numeric"
                maxLength={10}
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
