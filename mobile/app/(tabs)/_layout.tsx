import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Home, Search, PlusCircle, MessageCircle, User } from 'lucide-react-native';
import { colors, spacing, fontSize, fontWeight } from '../../constants/theme';

// Tab icons using Lucide icons (matching web)
const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const iconProps = {
    size: 24,
    color: focused ? colors.primary[600] : colors.slate[500],
    strokeWidth: focused ? 2.5 : 2,
  };

  const icons: Record<string, React.ReactElement> = {
    home: <Home {...iconProps} />,
    search: <Search {...iconProps} />,
    add: <PlusCircle {...iconProps} />,
    messages: <MessageCircle {...iconProps} />,
    profile: <User {...iconProps} />,
  };

  return (
    <View style={styles.iconContainer}>
      {icons[name] || icons.home}
    </View>
  );
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.slate[500],
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Buscar',
          tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Publicar',
          tabBarIcon: ({ focused }) => <TabIcon name="add" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensajes',
          tabBarIcon: ({ focused }) => <TabIcon name="messages" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card.light,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    height: 70,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
