import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { termsEs } from '../../../shared/legal/terms.es';
import { TERMS_BODY } from '../../../shared/legal/terms.structure';

/**
 * Terms & Conditions.
 *
 * The copy is NOT written here: it comes from shared/legal/terms.es.ts, the same
 * module the web page reads through i18next, and the reading order comes from
 * shared/legal/terms.structure.ts. Previously this screen held its own hardcoded
 * copy, so the two platforms could show different versions of a legal document
 * — they did, until both were edited by hand in the same pass.
 *
 * Mobile has no i18n runtime, so Spanish is imported directly. If mobile ever
 * gains one, swap `termsEs` for the active locale's module; nothing else moves.
 */
export default function TermsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  const renderBlock = ({ key, kind }: { key: string; kind: string }) => {
    const text = termsEs[key];
    if (!text) return null;

    switch (kind) {
      case 'title':
        return (
          <Text key={key} style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
            {text}
          </Text>
        );
      case 'note':
        return (
          <View
            key={key}
            // The palette only defines 50/100/400/500/600 — the old code asked
            // for 300 and 800, which resolved to undefined at runtime.
            style={[styles.warningBox, { backgroundColor: colors.warning[50], borderColor: colors.warning[100] }]}
          >
            <Text style={[styles.warningText, { color: colors.warning[600] }]}>{text}</Text>
          </View>
        );
      case 'listItem':
        return (
          <View key={key} style={styles.listRow}>
            <Text style={[styles.bullet, { color: themeColors.text.secondary }]}>{'•'}</Text>
            <Text style={[styles.paragraph, styles.listText, { color: themeColors.text.secondary }]}>{text}</Text>
          </View>
        );
      default:
        return (
          <Text key={key} style={[styles.paragraph, { color: themeColors.text.secondary }]}>
            {text}
          </Text>
        );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>{termsEs.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.lastUpdated, { color: themeColors.text.muted }]}>{termsEs.lastUpdated}</Text>

        {TERMS_BODY.map(renderBlock)}

        {/* Commission table (section 7) — the only block that is not plain prose. */}
        <View style={[styles.tableContainer, { borderColor: themeColors.border }]}>
          <View style={[styles.tableHeader, { backgroundColor: themeColors.card }]}>
            <Text style={[styles.tableHeaderText, styles.tableCellFlex, { color: themeColors.text.primary }]}>
              {termsEs.thPlan}
            </Text>
            <Text style={[styles.tableHeaderText, styles.tableCellFlex, { color: themeColors.text.primary }]}>
              {termsEs.thCommission}
            </Text>
          </View>
          {[termsEs.planProMonth, termsEs.planSuperProMonth].map((row, i) => (
            <View key={i} style={[styles.tableRow, { borderTopColor: themeColors.border }]}>
              <Text style={[styles.tableCell, styles.tableCellFlex, { color: themeColors.text.secondary }]}>{row}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  scrollContent: { padding: spacing.lg, paddingBottom: 50 },
  lastUpdated: { fontSize: fontSize.xs, marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm, marginTop: spacing.lg },
  paragraph: { fontSize: fontSize.sm, lineHeight: 22, marginBottom: spacing.sm },
  listRow: { flexDirection: 'row', paddingLeft: spacing.sm, marginBottom: spacing.xs },
  bullet: { fontSize: fontSize.sm, lineHeight: 22, marginRight: spacing.sm },
  listText: { flex: 1, marginBottom: 0 },
  warningBox: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginVertical: spacing.sm,
  },
  warningText: { fontSize: fontSize.sm, lineHeight: 20 },
  tableContainer: { borderWidth: 1, borderRadius: borderRadius.lg, overflow: 'hidden', marginVertical: spacing.sm },
  tableHeader: { flexDirection: 'row', padding: spacing.sm },
  tableHeaderText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  tableRow: { flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1 },
  tableCell: { fontSize: fontSize.sm },
  tableCellFlex: { flex: 1 },
});
