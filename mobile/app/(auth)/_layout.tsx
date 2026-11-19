import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Ingresar ↔ Registrarme: un fundido corto en vez del deslizamiento de la pila (pedido del dueño, 2026-11-17: «debe ser todo suave»).
        animation: 'fade',
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
