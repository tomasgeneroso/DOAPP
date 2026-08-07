import { View, Text, StyleSheet } from 'react-native';
import LegalDocument from '../../components/LegalDocument';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { termsEs } from '../../../shared/legal/terms.es';
import {
  TERMS_BODY_KEYS,
  TERMS_COMMISSION_AFTER,
  TERMS_COMMISSION_HEADERS,
  TERMS_COMMISSION_ROWS,
} from '../../../shared/legal/terms.structure';

/**
 * Copy comes from shared/legal — the same source the web page reads.
 * The commission table of clause 7.3 is the one block that is not prose, so it
 * is rendered here and injected at its place in the document.
 */
export default function TermsScreen() {
  const { colors: themeColors } = useTheme();

  const table = (
    <View style={[styles.table, { borderColor: themeColors.border }]}>
      <View style={[styles.row, { backgroundColor: themeColors.card }]}>
        {TERMS_COMMISSION_HEADERS.map((k) => (
          <Text key={k} style={[styles.cell, styles.headerCell, { color: themeColors.text.primary }]}>
            {termsEs[k]}
          </Text>
        ))}
      </View>
      {TERMS_COMMISSION_ROWS.map((r, i) => (
        <View key={i} style={[styles.row, styles.bodyRow, { borderTopColor: themeColors.border }]}>
          <Text style={[styles.cell, { color: themeColors.text.secondary }]}>
            {r.plan ?? (r.planKey ? termsEs[r.planKey] : '')}
          </Text>
          <Text style={[styles.cell, { color: themeColors.text.secondary }]}>{r.commission}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <LegalDocument
      copy={termsEs}
      keys={TERMS_BODY_KEYS}
      headerTitle="Términos y Condiciones"
      insertAfter={{ key: TERMS_COMMISSION_AFTER, node: table }}
    />
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderRadius: borderRadius.lg, overflow: 'hidden', marginVertical: spacing.sm },
  row: { flexDirection: 'row', padding: spacing.sm },
  bodyRow: { borderTopWidth: 1 },
  cell: { flex: 1, fontSize: fontSize.sm },
  headerCell: { fontWeight: fontWeight.semibold },
});
