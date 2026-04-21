import { Platform } from 'react-native';

export const colors = {
  // ── Primary — Sky blue ─────────────────────────
  primary: {
    50:  '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },

  // ── Secondary — Orange (CTA) ───────────────────
  secondary: {
    50:  '#fff7ed',
    100: '#ffedd5',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
  },

  // ── Premium — Violet ───────────────────────────
  premium: {
    50:  '#f5f3ff',
    100: '#ede9fe',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
  },

  // ── Neutral — Slate ────────────────────────────
  slate: {
    50:  '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },

  // ── Status ─────────────────────────────────────
  success: {
    50:  '#f0fdf4',
    100: '#dcfce7',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },

  warning: {
    50:  '#fffbeb',
    100: '#fef3c7',
    400: '#fbbf24',
    500: '#eab308',
    600: '#ca8a04',
  },

  danger: {
    50:  '#fef2f2',
    100: '#fee2e2',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },

  // ── Brand backgrounds ──────────────────────────
  background: {
    light: '#F0F4F8',
    dark:  '#070d1a',
  },

  card: {
    light: '#ffffff',
    dark:  '#0f1624',
  },

  // ── Text ───────────────────────────────────────
  text: {
    primary: {
      light: '#1e293b',
      dark:  '#ffffff',
    },
    secondary: {
      light: '#475569', // slate-600 — 5.9:1 on white ✓
      dark:  '#b0c4d8', // ~8:1 on dark bg ✓
    },
    muted: {
      light: '#64748b', // slate-500 — 4.75:1 on white ✓
      dark:  '#8a9bb0', // ~5.5:1 on dark bg ✓
    },
  },

  // ── Borders ────────────────────────────────────
  border: {
    light: '#e2e8f0',
    dark:  '#1e2d42',
  },

  // ── Gradients (as array for LinearGradient) ────
  gradient: {
    primary:   ['#0284c7', '#2563eb'] as const,
    secondary: ['#f97316', '#ea580c'] as const,
    premium:   ['#7c3aed', '#db2777'] as const,
    hero:      ['#0c4a6e', '#0369a1', '#1d4ed8'] as const,
    success:   ['#059669', '#16a34a'] as const,
    card:      ['#f0f9ff', '#eff6ff'] as const,
    cardDark:  ['#0f1624', '#0c1829'] as const,
  },

  // ── Glassmorphism surfaces ─────────────────────
  glass: {
    light: 'rgba(255, 255, 255, 0.82)',
    dark:  'rgba(7, 13, 26, 0.82)',
    border: {
      light: 'rgba(255, 255, 255, 0.5)',
      dark:  'rgba(255, 255, 255, 0.08)',
    },
  },
};

export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
};

export const borderRadius = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
};

export const fontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  lg:   17,
  xl:   19,
  '2xl': 22,
  '3xl': 28,
  '4xl': 34,
};

export const fontWeight = {
  normal:   '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  extrabold:'800' as const,
};

export const shadows = Platform.select({
  ios: {
    sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3  },
    md: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8  },
    lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 16 },
    xl: { shadowColor: '#000', shadowOffset: { width: 0, height:10 }, shadowOpacity: 0.18, shadowRadius: 24 },
    brand: {
      shadowColor: '#0284c7',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
    },
  },
  android: {
    sm:    { elevation: 2  },
    md:    { elevation: 5  },
    lg:    { elevation: 10 },
    xl:    { elevation: 16 },
    brand: { elevation: 8  },
  },
  default: {
    sm: {}, md: {}, lg: {}, xl: {}, brand: {},
  },
}) as { sm: object; md: object; lg: object; xl: object; brand: object };

// ── Reusable component styles ──────────────────────
export const commonStyles = {
  card: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },

  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.card.light,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    color: colors.text.primary.light,
  },

  buttonPrimary: {
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },

  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },

  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },

  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.text.primary.light,
    letterSpacing: -0.3,
  },

  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },

  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start' as const,
  },
};
