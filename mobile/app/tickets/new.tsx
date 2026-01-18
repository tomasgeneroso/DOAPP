import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Send,
  AlertCircle,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

const categories = [
  { value: 'support', label: 'Soporte General' },
  { value: 'bug', label: 'Reportar Error' },
  { value: 'feature', label: 'Solicitar Funcionalidad' },
  { value: 'report_user', label: 'Reportar Usuario' },
  { value: 'report_contract', label: 'Reportar Contrato' },
  { value: 'payment', label: 'Problema de Pago' },
  { value: 'other', label: 'Otro' },
];

const priorities = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export default function NewTicketScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  const [formData, setFormData] = useState({
    subject: '',
    category: 'support',
    priority: 'medium',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!formData.subject.trim()) {
      setError('El asunto es requerido');
      return;
    }
    if (!formData.message.trim()) {
      setError('El mensaje es requerido');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await post('/tickets', formData);

      if (response.success) {
        Alert.alert(
          'Ticket creado',
          'Tu ticket ha sido creado correctamente. Te responderemos pronto.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/help'),
            },
          ]
        );
      } else {
        setError(response.message || 'Error al crear el ticket');
      }
    } catch (err: any) {
      setError(err.message || 'Error al crear el ticket');
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
          Nuevo Ticket
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Description */}
        <Text style={[styles.description, { color: themeColors.text.muted }]}>
          ¿Necesitas ayuda? Crea un ticket de soporte y nuestro equipo te ayudará.
        </Text>

        {/* Error */}
        {error ? (
          <View style={[styles.errorContainer, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}>
            <AlertCircle size={20} color={colors.danger[500]} />
            <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
          </View>
        ) : null}

        {/* Form */}
        <View style={styles.form}>
          {/* Subject */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Asunto *
            </Text>
            <TextInput
              style={[styles.input, {
                backgroundColor: themeColors.card,
                borderColor: themeColors.border,
                color: themeColors.text.primary,
              }]}
              value={formData.subject}
              onChangeText={(text) => setFormData({ ...formData, subject: text })}
              placeholder="Describe brevemente tu problema"
              placeholderTextColor={themeColors.text.muted}
            />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Categoría *
            </Text>
            <View style={styles.selectContainer}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.selectOption,
                    {
                      backgroundColor: formData.category === cat.value
                        ? colors.primary[500]
                        : themeColors.card,
                      borderColor: formData.category === cat.value
                        ? colors.primary[500]
                        : themeColors.border,
                    },
                  ]}
                  onPress={() => setFormData({ ...formData, category: cat.value })}
                >
                  <Text style={[
                    styles.selectOptionText,
                    {
                      color: formData.category === cat.value
                        ? '#fff'
                        : themeColors.text.primary,
                    },
                  ]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Priority */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Prioridad *
            </Text>
            <View style={styles.priorityContainer}>
              {priorities.map((pri) => (
                <TouchableOpacity
                  key={pri.value}
                  style={[
                    styles.priorityOption,
                    {
                      backgroundColor: formData.priority === pri.value
                        ? colors.primary[500]
                        : themeColors.card,
                      borderColor: formData.priority === pri.value
                        ? colors.primary[500]
                        : themeColors.border,
                    },
                  ]}
                  onPress={() => setFormData({ ...formData, priority: pri.value })}
                >
                  <Text style={[
                    styles.priorityOptionText,
                    {
                      color: formData.priority === pri.value
                        ? '#fff'
                        : themeColors.text.primary,
                    },
                  ]}>
                    {pri.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Message */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Mensaje *
            </Text>
            <TextInput
              style={[styles.textArea, {
                backgroundColor: themeColors.card,
                borderColor: themeColors.border,
                color: themeColors.text.primary,
              }]}
              value={formData.message}
              onChangeText={(text) => setFormData({ ...formData, message: text })}
              placeholder="Describe tu problema o pregunta con el mayor detalle posible..."
              placeholderTextColor={themeColors.text.muted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, { opacity: loading ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Send size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Crear Ticket</Text>
            </>
          )}
        </TouchableOpacity>
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
  description: {
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  form: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    minHeight: 150,
  },
  selectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  selectOptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  priorityOptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
