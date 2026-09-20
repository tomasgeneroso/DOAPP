import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostWorkRatingGate } from '../components/PostWorkRatingModal';

function AppContent() {
  const { isDarkMode } = useTheme();
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  // La puntuacion post-trabajo es obligatoria: el portero consulta al
  // navegar y al volver a primer plano, y muestra la primera pendiente.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTick((t) => t + 1); });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <PostWorkRatingGate isAuthenticated={isAuthenticated} refreshKey={`${pathname}:${tick}`} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
