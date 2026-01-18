import { useState, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { get, post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface Contract {
  id: string;
  job?: {
    title: string;
  };
  client?: {
    name: string;
  };
  doer?: {
    name: string;
  };
  price: number;
  status: string;
  startDate: string;
}

const categories = [
  { value: 'service_not_delivered', label: 'Servicio no entregado' },
  { value: 'incomplete_work', label: 'Trabajo incompleto' },
  { value: 'quality_issues', label: 'Problemas de calidad' },
  { value: 'payment_issues', label: 'Problemas de pago' },
  { value: 'breach_of_contract', label: 'Incumplimiento de contrato' },
  { value: 'other', label: 'Otro' },
];

const statusLabels: Record<string, string> = {
  in_progress: 'En progreso',
  awaiting_confirmation: 'Esperando confirmación',
  completed: 'Completado',
};

export default function CreateDisputeScreen() {
  const router = useRouter();
  const { contractId: contractIdFromUrl } = useLocalSearchParams<{ contractId?: string }>();
  const { colors: themeColors } = useTheme();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>(contractIdFromUrl || '');
  const [loadingContracts, setLoadingContracts] = useState(false);

  const [formData, setFormData] = useState({
    reason: '',
    description: '',
    category: 'quality_issues',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!contractIdFromUrl) {
      loadUserContracts();
    }
  }, [contractIdFromUrl]);

  const loadUserContracts = async () => {
    try {
      setLoadingContracts(true);
      const response = await get<{ contracts: Contract[] }>('/contracts?status=in_progress,awaiting_confirmation,completed&limit=100');
      if (response.success && response.contracts) {
        setContracts(response.contracts);
      }
    } catch (err) {
      console.error('Error loading contracts:', err);
    } finally {
      setLoadingContracts(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedContract) {
      setError('Debes seleccionar un contrato');
      return;
    }
    if (!formData.reason.trim()) {
      setError('El motivo es requerido');
      return;
    }
    if (!formData.description.trim()) {
      setError('La descripción es requerida');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await post('/disputes', {
        contractId: selectedContract,
        reason: formData.reason,
        description: formData.description,
        category: formData.category,
      });

      if (response.success) {
        Alert.alert(
          'Disputa creada',
          'Tu disputa ha sido creada correctamente. Un administrador revisará tu caso.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/help'),
            },
          ]
        );
      } else {
        setError(response.message || 'Error al crear la disputa');
      }
    } catch (err: any) {
      setError(err.message || 'Error al crear la disputa');
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
          Abrir Disputa
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Icon */}
        <View style={styles.headerSection}>
          <View style={[styles.headerIcon, { backgroundColor: colors.danger[100] }]}>
            <AlertTriangle size={28} color={colors.danger[500]} />
          </View>
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>
            Reportar problema
          </Text>
          <Text style={[styles.headerDesc, { color: themeColors.text.muted }]}>
            Reporta un problema con tu contrato
          </Text>
        </View>

        {/* Error */}
        {error ? (
          <View style={[styles.errorContainer, { backgroundColor: colors.danger[50], borderColor: colors.danger[200] }]}>
            <AlertCircle size={20} color={colors.danger[500]} />
            <Text style={[styles.errorText, { color: colors.danger[700] }]}>{error}</Text>
          </View>
        ) : null}

        {/* Contract Selector */}
        {!contractIdFromUrl && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Seleccionar Contrato *
            </Text>
            {loadingContracts ? (
              <View style={styles.loadingContracts}>
                <ActivityIndicator color={colors.primary[500]} />
                <Text style={[styles.loadingText, { color: themeColors.text.muted }]}>
                  Cargando contratos...
                </Text>
              </View>
            ) : contracts.length === 0 ? (
              <View style={[styles.noContracts, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                <Text style={[styles.noContractsText, { color: colors.warning[700] }]}>
                  No tienes contratos activos para disputar
                </Text>
              </View>
            ) : (
              <View style={styles.contractsList}>
                {contracts.map((contract) => (
                  <TouchableOpacity
                    key={contract.id}
                    style={[
                      styles.contractCard,
                      {
                        backgroundColor: themeColors.card,
                        borderColor: selectedContract === contract.id
                          ? colors.danger[500]
                          : themeColors.border,
                        borderWidth: selectedContract === contract.id ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedContract(contract.id)}
                  >
                    <Text style={[styles.contractTitle, { color: themeColors.text.primary }]}>
                      {contract.job?.title || 'Sin título'}
                    </Text>
                    <View style={styles.contractDetails}>
                      <Text style={[styles.contractDetail, { color: themeColors.text.muted }]}>
                        Cliente: {contract.client?.name || 'N/A'}
                      </Text>
                      <Text style={[styles.contractDetail, { color: themeColors.text.muted }]}>
                        Proveedor: {contract.doer?.name || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.contractFooter}>
                      <View style={[styles.statusBadge, {
                        backgroundColor: contract.status === 'in_progress'
                          ? colors.primary[100]
                          : contract.status === 'completed'
                          ? colors.success[100]
                          : colors.warning[100],
                      }]}>
                        <Text style={[styles.statusText, {
                          color: contract.status === 'in_progress'
                            ? colors.primary[700]
                            : contract.status === 'completed'
                            ? colors.success[700]
                            : colors.warning[700],
                        }]}>
                          {statusLabels[contract.status] || contract.status}
                        </Text>
                      </View>
                      <Text style={[styles.contractPrice, { color: themeColors.text.primary }]}>
                        ${contract.price?.toLocaleString('es-AR')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Category */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: themeColors.text.primary }]}>
            Categoría del problema *
          </Text>
          <View style={styles.categoriesContainer}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryOption,
                  {
                    backgroundColor: formData.category === cat.value
                      ? colors.danger[500]
                      : themeColors.card,
                    borderColor: formData.category === cat.value
                      ? colors.danger[500]
                      : themeColors.border,
                  },
                ]}
                onPress={() => setFormData({ ...formData, category: cat.value })}
              >
                <Text style={[
                  styles.categoryText,
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

        {/* Reason */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: themeColors.text.primary }]}>
            Motivo (título breve) *
          </Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
              color: themeColors.text.primary,
            }]}
            value={formData.reason}
            onChangeText={(text) => setFormData({ ...formData, reason: text })}
            placeholder="Ej: El trabajo no cumple con lo acordado"
            placeholderTextColor={themeColors.text.muted}
            maxLength={200}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: themeColors.text.primary }]}>
            Descripción detallada *
          </Text>
          <TextInput
            style={[styles.textArea, {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
              color: themeColors.text.primary,
            }]}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            placeholder="Describe en detalle qué sucedió y por qué no estás satisfecho..."
            placeholderTextColor={themeColors.text.muted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={[styles.charCount, { color: themeColors.text.muted }]}>
            {formData.description.length}/2000 caracteres
          </Text>
        </View>

        {/* Warning */}
        <View style={[styles.warningBox, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
          <AlertTriangle size={20} color={colors.warning[600]} />
          <View style={styles.warningContent}>
            <Text style={[styles.warningTitle, { color: colors.warning[800] }]}>Importante</Text>
            <Text style={[styles.warningText, { color: colors.warning[700] }]}>
              Al abrir una disputa, el pago quedará retenido en escrow hasta que un administrador resuelva el caso.
              El proceso puede tomar de 3 a 5 días hábiles.
            </Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.danger[500], opacity: loading ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <AlertTriangle size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Abrir Disputa</Text>
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
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  headerDesc: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
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
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  loadingContracts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  loadingText: {
    fontSize: fontSize.sm,
  },
  noContracts: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  noContractsText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  contractsList: {
    gap: spacing.md,
  },
  contractCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  contractTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  contractDetails: {
    gap: spacing.xs,
  },
  contractDetail: {
    fontSize: fontSize.sm,
  },
  contractFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  contractPrice: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  categoryText: {
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
  charCount: {
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
  warningContent: {
    flex: 1,
    gap: spacing.xs,
  },
  warningTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  warningText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
