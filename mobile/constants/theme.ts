// Theme constants matching the web app
// Based on Tailwind CSS colors used in client/global.css and components

import { Platform } from 'react-native';

export const colors = {
  // Primary - Sky blue (main accent)
  primary: {
    50: '#f0f9ff',
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

  // Secondary - Orange (CTA, highlights)
  secondary: {
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
  },

  // Neutral - Slate (text, backgrounds)
  slate: {
    50: '#f8fafc',
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

  // Status colors
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    500: '#22c55e',
    600: '#16a34a',
  },

  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#eab308',
    600: '#ca8a04',
  },

  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
  },

  // Background colors (matching web)
  background: {
    light: '#FFFFFF',
    dark: '#121212',
  },

  // Card colors
  card: {
    light: '#ffffff',
    dark: '#1e293b', // slate-800
  },

  // Text colors
  text: {
    primary: {
      light: '#1e293b', // slate-800
      dark: '#ffffff',
    },
    secondary: {
      light: '#64748b', // slate-500
      dark: '#94a3b8', // slate-400
    },
    muted: {
      light: '#94a3b8', // slate-400
      dark: '#64748b', // slate-500
    },
  },

  // Border colors
  border: {
    light: '#e2e8f0', // slate-200
    dark: '#334155', // slate-700
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Shadows disabled for web compatibility
// Use borders for visual definition instead
export const shadows = {
  sm: {},
  md: {},
  lg: {},
};

// Common component styles
export const commonStyles = {
  // Card style matching web
  card: {
    backgroundColor: colors.card.light,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },

  // Input style matching web
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.card.light,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    color: colors.text.primary.light,
  },

  // Button primary style
  buttonPrimary: {
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Button secondary style
  buttonSecondary: {
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.secondary[500],
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Button text
  buttonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },

  // Page container
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },

  // Header style
  header: {
    padding: spacing.lg,
    backgroundColor: colors.card.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },

  // Header title
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.text.primary.light,
  },
};
