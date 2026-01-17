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
    </Stack>
  );
}
