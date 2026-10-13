import { Stack } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Redirect } from 'expo-router';

export default function AdminLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Show nothing while loading
  if (isLoading) {
    return null;
  }

  // Redirect if not authenticated or not admin
  if (!isAuthenticated || !user?.adminRole) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0284c7', // sky-600
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Panel Admin',
        }}
      />
      <Stack.Screen
        name="disputes"
        options={{
          title: 'Disputas',
        }}
      />
      <Stack.Screen
        name="tickets"
        options={{
          title: 'Tickets',
        }}
      />
      <Stack.Screen
        name="withdrawals"
        options={{
          title: 'Retiros',
        }}
      />
      <Stack.Screen name="payments" options={{ title: 'Pagos a verificar' }} />
      <Stack.Screen name="contracts" options={{ title: 'Contratos a aprobar' }} />
      <Stack.Screen name="jobs" options={{ title: 'Publicaciones a aprobar' }} />
      <Stack.Screen name="dispute/[id]" options={{ title: 'Disputa' }} />
      <Stack.Screen name="influencer-invites" options={{ title: 'Invitaciones de creadores' }} />
    </Stack>
  );
}
