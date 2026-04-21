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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Tag,
  Users,
  CheckCircle,
  ClipboardList,
  Plus,
  Trash2,
  ChevronDown,
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
  const [postalCode, setPostalCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [endDateFlexible, setEndDateFlexible] = useState(false);

  // Date/time picker modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'startDate' | 'startTime' | 'endDate' | 'endTime'>('startDate');
  const [pickerDay, setPickerDay] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [maxWorkers, setMaxWorkers] = useState('1');
  const [requirements, setRequirements] = useState(['', '', '']);
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
  const handleDateInput = (text: string, setter: (v: string) => void) => {
    const digits = text.replace(/\D/g, '').substring(0, 8);
    let formatted = digits;
    if (digits.length >= 3) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length >= 5) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    setter(formatted);
  };

  // Date/time picker helpers
  const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const daysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  const days = Array.from({ length: daysInMonth(pickerMonth, pickerYear) }, (_, i) => i + 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const openPicker = (target: typeof pickerTarget) => {
    const now = new Date();
    if (target === 'startDate') {
      const d = parseDMY(startDate) || now;
      setPickerDay(d.getDate()); setPickerMonth(d.getMonth() + 1); setPickerYear(d.getFullYear());
    } else if (target === 'endDate') {
      const d = parseDMY(endDate) || now;
      setPickerDay(d.getDate()); setPickerMonth(d.getMonth() + 1); setPickerYear(d.getFullYear());
    } else if (target === 'startTime') {
      const [h = 9, m = 0] = startTime.split(':').map(Number);
      setPickerHour(h); setPickerMinute(m);
    } else {
      const [h = 9, m = 0] = endTime.split(':').map(Number);
      setPickerHour(h); setPickerMinute(m);
    }
    setPickerTarget(target);
    setPickerVisible(true);
  };

  const parseDMY = (s: string): Date | null => {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  };

  const confirmPicker = () => {
    if (pickerTarget === 'startDate') {
      setStartDate(`${String(pickerDay).padStart(2,'0')}/${String(pickerMonth).padStart(2,'0')}/${pickerYear}`);
    } else if (pickerTarget === 'endDate') {
      setEndDate(`${String(pickerDay).padStart(2,'0')}/${String(pickerMonth).padStart(2,'0')}/${pickerYear}`);
    } else if (pickerTarget === 'startTime') {
      setStartTime(`${String(pickerHour).padStart(2,'0')}:${String(pickerMinute).padStart(2,'0')}`);
    } else {
      setEndTime(`${String(pickerHour).padStart(2,'0')}:${String(pickerMinute).padStart(2,'0')}`);
    }
    setPickerVisible(false);
  };

  const isTimePicker = pickerTarget === 'startTime' || pickerTarget === 'endTime';

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
    if (!startTime.trim()) newErrors.startTime = 'La hora de inicio es requerida';
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
      // Convert DD/MM/YYYY [HH:MM] to ISO 8601
      const toISO = (dateStr: string, timeStr?: string): string => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          if (timeStr) return `${isoDate}T${timeStr}:00.000Z`;
          return isoDate;
        }
        return dateStr;
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
        postalCode: postalCode.trim() || undefined,
        startDate: toISO(startDate, startTime || undefined),
        endDate: endDateFlexible ? undefined : (endDate ? toISO(endDate, endTime || undefined) : undefined),
        endDateFlexible,
        maxWorkers: parseInt(maxWorkers) || 1,
        completionRequirements: requirements.filter(r => r.trim()),
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
                  {category
                    ? `${categories.find(c => c.id === category)?.icon || ''} ${categories.find(c => c.id === category)?.label || category}`
                    : 'Selecciona una categoría'}
                </Text>
              </TouchableOpacity>
              {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

              {showCategories && (
                <View style={[styles.categoriesList, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryItem,
                        category === cat.id && { backgroundColor: themeColors.primary[50] },
                      ]}
                      onPress={() => {
                        setCategory(cat.id);
                        setShowCategories(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.categoryItemText,
                          { color: category === cat.id ? themeColors.primary[600] : themeColors.text.primary },
                        ]}
                      >
                        {cat.icon} {cat.label}
                      </Text>
                      {category === cat.id && <CheckCircle size={18} color={themeColors.primary[600]} />}
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

            {/* Postal Code */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Código postal (opcional)
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
                placeholder="Ej: 1425"
                placeholderTextColor={themeColors.text.muted}
                value={postalCode}
                onChangeText={setPostalCode}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            {/* Start Date + Time */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Calendar size={16} color={themeColors.text.secondary} /> Fecha y hora de inicio *
              </Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={[
                    styles.datePickerBtn,
                    {
                      backgroundColor: themeColors.slate[50],
                      borderColor: errors.startDate ? colors.danger[500] : themeColors.border,
                      flex: 3,
                    },
                  ]}
                  onPress={() => openPicker('startDate')}
                >
                  <Calendar size={16} color={startDate ? themeColors.text.primary : themeColors.text.muted} strokeWidth={2} />
                  <Text style={[styles.datePickerText, { color: startDate ? themeColors.text.primary : themeColors.text.muted }]}>
                    {startDate || 'DD/MM/AAAA'}
                  </Text>
                  <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.datePickerBtn,
                    {
                      backgroundColor: themeColors.slate[50],
                      borderColor: errors.startTime ? colors.danger[500] : themeColors.border,
                      flex: 2,
                    },
                  ]}
                  onPress={() => openPicker('startTime')}
                >
                  <Clock size={16} color={startTime ? themeColors.text.primary : themeColors.text.muted} strokeWidth={2} />
                  <Text style={[styles.datePickerText, { color: startTime ? themeColors.text.primary : themeColors.text.muted }]}>
                    {startTime || 'HH:MM'}
                  </Text>
                  <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              {errors.startDate && <Text style={styles.errorText}>{errors.startDate}</Text>}
              {errors.startTime && <Text style={styles.errorText}>{errors.startTime}</Text>}
            </View>

            {/* End Date + Time */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Fecha y hora de fin
              </Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={[
                    styles.datePickerBtn,
                    {
                      backgroundColor: endDateFlexible ? themeColors.slate[100] : themeColors.slate[50],
                      borderColor: errors.endDate ? colors.danger[500] : themeColors.border,
                      flex: 3,
                      opacity: endDateFlexible ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => !endDateFlexible && openPicker('endDate')}
                  disabled={endDateFlexible}
                >
                  <Calendar size={16} color={endDate ? themeColors.text.primary : themeColors.text.muted} strokeWidth={2} />
                  <Text style={[styles.datePickerText, { color: endDate ? themeColors.text.primary : themeColors.text.muted }]}>
                    {endDate || 'DD/MM/AAAA'}
                  </Text>
                  <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.datePickerBtn,
                    {
                      backgroundColor: endDateFlexible ? themeColors.slate[100] : themeColors.slate[50],
                      borderColor: themeColors.border,
                      flex: 2,
                      opacity: endDateFlexible ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => !endDateFlexible && openPicker('endTime')}
                  disabled={endDateFlexible}
                >
                  <Clock size={16} color={endTime ? themeColors.text.primary : themeColors.text.muted} strokeWidth={2} />
                  <Text style={[styles.datePickerText, { color: endTime ? themeColors.text.primary : themeColors.text.muted }]}>
                    {endTime || 'HH:MM'}
                  </Text>
                  <ChevronDown size={16} color={themeColors.text.muted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              {errors.endDate && <Text style={styles.errorText}>{errors.endDate}</Text>}

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

            {/* Date/Time Picker Modal */}
            <Modal visible={pickerVisible} transparent animationType="slide">
              <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)} />
              <View style={[styles.pickerSheet, { backgroundColor: themeColors.card }]}>
                <View style={[styles.pickerHeader, { borderBottomColor: themeColors.border }]}>
                  <TouchableOpacity onPress={() => setPickerVisible(false)}>
                    <Text style={[styles.pickerCancel, { color: themeColors.text.secondary }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <Text style={[styles.pickerTitle, { color: themeColors.text.primary }]}>
                    {pickerTarget === 'startDate' ? 'Fecha de inicio'
                      : pickerTarget === 'endDate' ? 'Fecha de fin'
                      : pickerTarget === 'startTime' ? 'Hora de inicio'
                      : 'Hora de fin'}
                  </Text>
                  <TouchableOpacity onPress={confirmPicker}>
                    <Text style={[styles.pickerConfirm, { color: themeColors.primary[600] }]}>Listo</Text>
                  </TouchableOpacity>
                </View>

                {isTimePicker ? (
                  <View style={styles.pickerColumns}>
                    {/* Hour column */}
                    <View style={styles.pickerColumn}>
                      <Text style={[styles.pickerColLabel, { color: themeColors.text.muted }]}>Hora</Text>
                      <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                        {hours.map((h) => (
                          <TouchableOpacity key={h} style={[styles.pickerItem, pickerHour === h && { backgroundColor: themeColors.primary[50] }]} onPress={() => setPickerHour(h)}>
                            <Text style={[styles.pickerItemText, { color: pickerHour === h ? themeColors.primary[600] : themeColors.text.primary }, pickerHour === h && { fontWeight: fontWeight.bold }]}>
                              {String(h).padStart(2, '0')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    {/* Minute column */}
                    <View style={styles.pickerColumn}>
                      <Text style={[styles.pickerColLabel, { color: themeColors.text.muted }]}>Min</Text>
                      <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                        {minutes.map((m) => (
                          <TouchableOpacity key={m} style={[styles.pickerItem, pickerMinute === m && { backgroundColor: themeColors.primary[50] }]} onPress={() => setPickerMinute(m)}>
                            <Text style={[styles.pickerItemText, { color: pickerMinute === m ? themeColors.primary[600] : themeColors.text.primary }, pickerMinute === m && { fontWeight: fontWeight.bold }]}>
                              {String(m).padStart(2, '0')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pickerColumns}>
                    {/* Day */}
                    <View style={styles.pickerColumn}>
                      <Text style={[styles.pickerColLabel, { color: themeColors.text.muted }]}>Día</Text>
                      <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                        {days.map((d) => (
                          <TouchableOpacity key={d} style={[styles.pickerItem, pickerDay === d && { backgroundColor: themeColors.primary[50] }]} onPress={() => setPickerDay(d)}>
                            <Text style={[styles.pickerItemText, { color: pickerDay === d ? themeColors.primary[600] : themeColors.text.primary }, pickerDay === d && { fontWeight: fontWeight.bold }]}>{String(d).padStart(2,'0')}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    {/* Month */}
                    <View style={[styles.pickerColumn, { flex: 1.6 }]}>
                      <Text style={[styles.pickerColLabel, { color: themeColors.text.muted }]}>Mes</Text>
                      <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                        {MONTHS.map((name, i) => (
                          <TouchableOpacity key={i+1} style={[styles.pickerItem, pickerMonth === i+1 && { backgroundColor: themeColors.primary[50] }]} onPress={() => setPickerMonth(i+1)}>
                            <Text style={[styles.pickerItemText, { color: pickerMonth === i+1 ? themeColors.primary[600] : themeColors.text.primary }, pickerMonth === i+1 && { fontWeight: fontWeight.bold }]}>{name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    {/* Year */}
                    <View style={[styles.pickerColumn, { flex: 1.6 }]}>
                      <Text style={[styles.pickerColLabel, { color: themeColors.text.muted }]}>Año</Text>
                      <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                        {years.map((y) => (
                          <TouchableOpacity key={y} style={[styles.pickerItem, pickerYear === y && { backgroundColor: themeColors.primary[50] }]} onPress={() => setPickerYear(y)}>
                            <Text style={[styles.pickerItemText, { color: pickerYear === y ? themeColors.primary[600] : themeColors.text.primary }, pickerYear === y && { fontWeight: fontWeight.bold }]}>{y}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>
            </Modal>

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

            {/* Completion Requirements */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <ClipboardList size={16} color={themeColors.text.secondary} /> Requisitos de finalización
              </Text>
              <View style={[styles.requirementsInfo, { backgroundColor: themeColors.primary[50] }]}>
                <Text style={[styles.requirementsInfoText, { color: themeColors.primary[700] }]}>
                  Definí los criterios mínimos para considerar el trabajo terminado. Esto sirve como respaldo ante posibles disputas. Al postularse, se recomienda a los trabajadores consultar estos requisitos.
                </Text>
              </View>
              {requirements.map((req, idx) => (
                <View key={idx} style={styles.requirementRow}>
                  <Text style={[styles.requirementIndex, { color: themeColors.text.muted }]}>{idx + 1}.</Text>
                  <TextInput
                    style={[
                      styles.requirementInput,
                      {
                        backgroundColor: themeColors.slate[50],
                        borderColor: themeColors.border,
                        color: themeColors.text.primary,
                      },
                    ]}
                    placeholder={`Ej: ${idx === 0 ? 'Sin telas de araña en esquinas de paredes' : idx === 1 ? 'Pisos barridos y trapeados en todos los ambientes' : 'Baños desinfectados y limpios'}`}
                    placeholderTextColor={themeColors.text.muted}
                    value={req}
                    onChangeText={(text) => {
                      const updated = [...requirements];
                      updated[idx] = text;
                      setRequirements(updated);
                    }}
                    multiline
                  />
                  {requirements.length > 3 && (
                    <TouchableOpacity
                      onPress={() => setRequirements(requirements.filter((_, i) => i !== idx))}
                      style={styles.removeRequirementBtn}
                    >
                      <Trash2 size={16} color={colors.danger[500]} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {requirements.length < 8 && (
                <TouchableOpacity
                  style={[styles.addRequirementBtn, { borderColor: themeColors.primary[400] }]}
                  onPress={() => setRequirements([...requirements, ''])}
                >
                  <Plus size={16} color={themeColors.primary[600]} />
                  <Text style={[styles.addRequirementText, { color: themeColors.primary[600] }]}>Agregar requisito</Text>
                </TouchableOpacity>
              )}
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
  requirementsInfo: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  requirementsInfoText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  requirementIndex: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: 14,
    width: 18,
  },
  requirementInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  removeRequirementBtn: {
    marginTop: 12,
    padding: 4,
  },
  addRequirementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  addRequirementText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
  // Date/time picker
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  datePickerText: {
    flex: 1,
    fontSize: fontSize.base,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pickerCancel: {
    fontSize: fontSize.base,
  },
  pickerConfirm: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pickerColumns: {
    flexDirection: 'row',
    height: 220,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pickerColumn: {
    flex: 1,
    overflow: 'hidden',
  },
  pickerColLabel: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerScroll: {
    flex: 1,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: 2,
    marginVertical: 1,
  },
  pickerItemText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
});
