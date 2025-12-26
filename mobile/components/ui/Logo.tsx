import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface LogoProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  showText?: boolean;
  onPress?: () => void;
  style?: object;
}

const sizes = {
  small: {
    container: 32,
    iconText: 14,
    appText: 18,
    borderRadius: 8,
  },
  medium: {
    container: 44,
    iconText: 20,
    appText: 24,
    borderRadius: 12,
  },
  large: {
    container: 56,
    iconText: 26,
    appText: 32,
    borderRadius: 16,
  },
  xlarge: {
    container: 80,
    iconText: 36,
    appText: 42,
    borderRadius: 20,
  },
};

export default function Logo({ size = 'medium', showText = true, onPress, style }: LogoProps) {
  const router = useRouter();
  const sizeConfig = sizes[size];

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push('/(tabs)');
    }
  };

  const content = (
    <View style={[styles.container, style]}>
      {/* Logo Icon - DO */}
      <View
        style={[
          styles.iconContainer,
          {
            width: sizeConfig.container,
            height: sizeConfig.container,
            borderRadius: sizeConfig.borderRadius,
          },
        ]}
      >
        <Text
          style={[
            styles.iconText,
            { fontSize: sizeConfig.iconText },
          ]}
        >
          DO
        </Text>
      </View>

      {/* Logo Text - APP */}
      {showText && (
        <Text
          style={[
            styles.appText,
            { fontSize: sizeConfig.appText },
          ]}
        >
          APP
        </Text>
      )}
    </View>
  );

  if (onPress !== undefined) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// Versión solo icono para espacios pequeños
export function LogoIcon({ size = 'medium', onPress }: { size?: 'small' | 'medium' | 'large'; onPress?: () => void }) {
  return <Logo size={size} showText={false} onPress={onPress} />;
}

// Versión completa con animación de hover (para headers)
export function LogoFull({ size = 'medium', onPress }: { size?: 'small' | 'medium' | 'large'; onPress?: () => void }) {
  return <Logo size={size} showText={true} onPress={onPress} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary[500],
  },
  iconText: {
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
  },
  appText: {
    fontWeight: '900',
    color: colors.primary[600],
    letterSpacing: -0.5,
  },
});
