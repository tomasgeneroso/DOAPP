import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { buildLegalBody } from '../../shared/legal/classify';

/**
 * Renders any of the legal documents from shared/legal.
 *
 * Mobile used to hold its own copy of every legal text, so the app and the web
 * could show different versions of the same document — and did. Now the copy
 * and the reading order both come from shared/, and this component is the only
 * place that knows how to lay them out on a phone.
 */
export default function LegalDocument({
  copy,
  keys,
  headerTitle,
  insertAfter,
}: {
  copy: Record<string, string>;
  keys: string[];
  headerTitle?: string;
  /** Non-prose block (e.g. the commission table) placed after a given key. */
  insertAfter?: { key: string; node: React.ReactNode };
}) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const body = buildLegalBody(keys);

  /**
   * The web copy carries <b> markup (it renders through <Trans>). React Native
   * has no HTML, so bold runs become nested <Text> and any other tag is
   * dropped — printing a literal "<b>" in a legal document is not acceptable,
   * and the bold lead-in on each bullet does carry meaning.
   */
  const renderRich = (raw: string): React.ReactNode => {
    const stripped = raw.replace(/<(?!\/?b>)[^>]+>/gi, '');
    const parts = stripped.split(/(<b>[\s\S]*?<\/b>)/gi).filter(Boolean);
    if (parts.length === 1) return parts[0];
    return parts.map((p, i) => {
      const bold = /^<b>[\s\S]*<\/b>$/i.test(p);
      return bold ? (
        <Text key={i} style={{ fontWeight: fontWeight.semibold }}>
          {p.replace(/<\/?b>/gi, '')}
        </Text>
      ) : (
        <Text key={i}>{p}</Text>
      );
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {headerTitle || copy.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!!copy.lastUpdated && (
          <Text style={[styles.lastUpdated, { color: themeColors.text.muted }]}>{copy.lastUpdated}</Text>
        )}

        {body.map(({ key, kind }) => {
          const text = copy[key];
          if (!text) return null;

          const extra = insertAfter?.key === key
            ? <React.Fragment key={`${key}-extra`}>{insertAfter.node}</React.Fragment>
            : null;
          const withExtra = (node: React.ReactNode) =>
            extra ? <React.Fragment key={key}>{node}{extra}</React.Fragment> : node;

          switch (kind) {
            case 'title':
              return withExtra(
                <Text key={key} style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
                  {renderRich(text)}
                </Text>,
              );
            case 'note':
              return withExtra(
                <View
                  key={key}
                  style={[styles.noteBox, { backgroundColor: colors.warning[50], borderColor: colors.warning[100] }]}
                >
                  <Text style={[styles.noteText, { color: colors.warning[600] }]}>{renderRich(text)}</Text>
                </View>,
              );
            case 'listItem':
              return withExtra(
                <View key={key} style={styles.listRow}>
                  <Text style={[styles.bullet, { color: themeColors.text.secondary }]}>{'•'}</Text>
                  <Text style={[styles.paragraph, styles.listText, { color: themeColors.text.secondary }]}>
                    {renderRich(text)}
                  </Text>
                </View>,
              );
            default:
              return withExtra(
                <Text key={key} style={[styles.paragraph, { color: themeColors.text.secondary }]}>
                  {renderRich(text)}
                </Text>,
              );
          }
        })}
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
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  scrollContent: { padding: spacing.lg, paddingBottom: 50 },
  lastUpdated: { fontSize: fontSize.xs, marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm, marginTop: spacing.lg },
  paragraph: { fontSize: fontSize.sm, lineHeight: 22, marginBottom: spacing.sm },
  listRow: { flexDirection: 'row', paddingLeft: spacing.sm, marginBottom: spacing.xs },
  bullet: { fontSize: fontSize.sm, lineHeight: 22, marginRight: spacing.sm },
  listText: { flex: 1, marginBottom: 0 },
  noteBox: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginVertical: spacing.sm,
  },
  noteText: { fontSize: fontSize.sm, lineHeight: 20 },
});
