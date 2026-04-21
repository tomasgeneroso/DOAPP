import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { LogoIcon } from '../../components/ui/Logo';

export default function CreateScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { colors: themeColors } = useTheme();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <LogoIcon size="small" />
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Publicar</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => router.push('/create-job')}
          activeOpacity={0.7}
        >
          <View style={[styles.optionIconContainer, { backgroundColor: themeColors.primary[50] }]}>
            <Text style={styles.optionIcon}>💼</Text>
          </View>
          <View style={styles.optionInfo}>
            <Text style={[styles.optionTitle, { color: themeColors.text.primary }]}>Publicar un trabajo</Text>
            <Text style={[styles.optionDescription, { color: themeColors.text.secondary }]}>
              Encontrá profesionales para tu proyecto o tarea
            </Text>
          </View>
          <Text style={[styles.optionArrow, { color: themeColors.text.muted }]}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => router.push('/portfolio/add')}
          activeOpacity={0.7}
        >
          <View style={[styles.optionIconContainer, { backgroundColor: themeColors.primary[50] }]}>
            <Text style={styles.optionIcon}>🖼️</Text>
          </View>
          <View style={styles.optionInfo}>
            <Text style={[styles.optionTitle, { color: themeColors.text.primary }]}>Agregar a mi portfolio</Text>
            <Text style={[styles.optionDescription, { color: themeColors.text.secondary }]}>
              Mostrá tus trabajos anteriores a potenciales clientes
            </Text>
          </View>
          <Text style={[styles.optionArrow, { color: themeColors.text.muted }]}>›</Text>
        </TouchableOpacity>

        <View style={[styles.tipsSection, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.tipsTitle, { color: themeColors.text.primary }]}>💡 Tips para publicar</Text>
          {['Describí claramente qué necesitás', 'Especificá la ubicación y fechas', 'Establecé un presupuesto acorde al mercado', 'Definí requisitos mínimos de finalización para evitar disputas'].map((tip) => (
            <View key={tip} style={styles.tipItem}>
              <View style={[styles.tipBullet, { backgroundColor: themeColors.primary[500] }]} />
              <Text style={[styles.tipText, { color: themeColors.text.secondary }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold },
  scrollView: { flex: 1 },
  content: { padding: spacing.lg },
  optionCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  optionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  optionIcon: { fontSize: 28 },
  optionInfo: { flex: 1 },
  optionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  optionDescription: { fontSize: fontSize.sm, lineHeight: 20 },
  optionArrow: { fontSize: fontSize['2xl'], marginLeft: spacing.sm },
  tipsSection: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
  },
  tipsTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: spacing.md },
  tipItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  tipBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: spacing.sm },
  tipText: { flex: 1, fontSize: fontSize.sm, lineHeight: 20 },
});
