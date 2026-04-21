import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Home, Search, Plus, MessageCircle, User } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius } from '../../constants/theme';

const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const { colors: themeColors } = useTheme();
  const activeColor = themeColors.primary[600];
  const inactiveColor = themeColors.text.muted;

  const iconProps = {
    size: 26,
    color: focused ? activeColor : inactiveColor,
    strokeWidth: focused ? 2.5 : 1.8,
  };

  const icons: Record<string, React.ReactElement> = {
    home:     <Home {...iconProps} />,
    search:   <Search {...iconProps} />,
    messages: <MessageCircle {...iconProps} />,
    profile:  <User {...iconProps} />,
  };

  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      {icons[name] || icons.home}
    </View>
  );
};

const CreateTabIcon = ({ focused }: { focused: boolean }) => (
  <View style={[styles.createBtn, focused && styles.createBtnFocused]}>
    <Plus size={28} color="#fff" strokeWidth={2.8} />
  </View>
);

export default function TabsLayout() {
  const { colors: themeColors, isDarkMode } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: isDarkMode
              ? 'rgba(15, 22, 36, 0.97)'
              : 'rgba(255, 255, 255, 0.97)',
            borderTopColor: isDarkMode
              ? 'rgba(30, 45, 66, 0.8)'
              : 'rgba(226, 232, 240, 0.8)',
          },
        ],
        tabBarActiveTintColor: themeColors.primary[600],
        tabBarInactiveTintColor: themeColors.text.muted,
        tabBarItemStyle: styles.tabBarItem,
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
          tabBarIcon: ({ focused }) => <CreateTabIcon focused={focused} />,
          tabBarItemStyle: styles.createItem,
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
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
    height: Platform.OS === 'ios' ? 76 : 64,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  tabBarItem: {
    paddingTop: spacing.sm,
    flex: 1,
  },
  createItem: {
    flex: 1,
    paddingTop: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 36,
    borderRadius: borderRadius.lg,
  },
  iconWrapActive: {
    backgroundColor: colors.primary[50],
  },
  // Botón "Publicar" — pill flotante con gradiente
  createBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12, // eleva sobre el tab bar
    ...Platform.select({
      ios: {
        shadowColor: colors.primary[600],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
  createBtnFocused: {
    backgroundColor: colors.primary[700],
    ...Platform.select({
      ios: {
        shadowColor: colors.primary[600],
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
      },
      android: { elevation: 12 },
    }),
  },
});
