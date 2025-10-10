export const colors = {
  light: {
    primary: {
      50: '#FFF3E0',
      100: '#FFE0B2',
      200: '#FFCC80',
      300: '#FFB74D',
      400: '#FFA726',
      500: '#FF9800',
      600: '#FB8C00',
    },
    secondary: {
      50: '#E3F2FD',
      100: '#BBDEFB',
      200: '#90CAF9',
      300: '#64B5F6',
      400: '#42A5F5',
      500: '#2196F3',
      600: '#1E88E5',
    },
    success: '#81C784',
    warning: '#FFB74D',
    error: '#E57373',
    info: '#64B5F6',
    background: {
      primary: '#F5F5F5',
      secondary: '#FFFFFF',
      card: '#FFFFFF',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
      disabled: '#BDBDBD',
    },
    border: {
      light: '#E0E0E0',
      medium: '#BDBDBD',
    },
  },
  dark: {
    primary: {
      50: '#332200',
      100: '#4D3300',
      200: '#664400',
      300: '#996600',
      400: '#CC8800',
      500: '#FFB74D',
      600: '#FFC266',
    },
    secondary: {
      50: '#001F33',
      100: '#003D66',
      200: '#005C99',
      300: '#007ACC',
      400: '#2196F3',
      500: '#64B5F6',
      600: '#90CAF9',
    },
    success: '#66BB6A',
    warning: '#FFA726',
    error: '#EF5350',
    info: '#42A5F5',
    background: {
      primary: '#121212',
      secondary: '#1E1E1E',
      card: '#2C2C2C',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#B0B0B0',
      disabled: '#666666',
    },
    border: {
      light: '#333333',
      medium: '#4D4D4D',
    },
  },
} as const;

export type ColorScheme = typeof colors.light;