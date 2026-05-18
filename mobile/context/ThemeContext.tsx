import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  isDarkMode: boolean;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  colors: typeof lightColors;
}

const lightColors = {
  background: '#F0F4F8',
  card: '#ffffff',
  text: {
    primary:   '#1e293b',
    secondary: '#475569',
    muted:     '#64748b',
  },
  textSecondary: '#475569',
  border: '#e2e8f0',
  primary: {
    50:  '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
  },
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
  },
  success: '#16a34a',
  error:   '#dc2626',
  warning: '#d97706',
  glass: 'rgba(255, 255, 255, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
};

const darkColors = {
  background: '#070d1a',
  card: '#0f1624',
  text: {
    primary:   '#f1f5f9',
    secondary: '#b0c4d8',
    muted:     '#8a9bb0',
  },
  textSecondary: '#b0c4d8',
  border: '#1e2d42',
  primary: {
    50:  '#082032',
    100: '#0c3050',
    200: '#0e4070',
    300: '#1260a8',
    400: '#1d80d8',
    500: '#38bdf8',
    600: '#38bdf8',
    700: '#7dd3fc',
  },
  slate: {
    50:  '#0f1624',
    100: '#1e2d42',
    200: '#2a3d56',
    300: '#3d566e',
    400: '#94a3b8',
    500: '#b0c4d8',
    600: '#cbd5e1',
    700: '#e2eaf2',
    800: '#f1f5f9',
  },
  success: '#22c55e',
  error:   '#ef4444',
  warning: '#f59e0b',
  glass: 'rgba(7, 13, 26, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'app_theme_mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
          setThemeModeState(saved);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  // Determine if dark mode is active
  const isDarkMode = themeMode === 'system'
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';

  // Toggle between light and dark
  const toggleTheme = async () => {
    const newMode: ThemeMode = isDarkMode ? 'light' : 'dark';
    setThemeModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  // Set specific theme mode
  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const colors = isDarkMode ? darkColors : lightColors;

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, themeMode, toggleTheme, setThemeMode, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
