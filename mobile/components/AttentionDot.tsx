import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { TaskPriority } from '../hooks/usePendingTasks';

/**
 * Mobile counterpart of client/components/AttentionDot.tsx. Same meaning:
 * red = blocking, amber = should do soon, sky = optional. Never dismissible —
 * it disappears only when the underlying task is actually done.
 */

const COLOR: Record<TaskPriority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#0ea5e9',
};

export default function AttentionDot({
  priority = 'high',
  count,
  ringColor = '#ffffff',
  style,
}: {
  priority?: TaskPriority | null;
  count?: number;
  /** Should match the surface behind the dot so the ring reads as a cutout. */
  ringColor?: string;
  style?: any;
}) {
  if (!priority) return null;
  if (typeof count === 'number' && count <= 0) return null;

  const backgroundColor = COLOR[priority];
  const showCount = typeof count === 'number' && count > 1;

  if (showCount) {
    return (
      <View
        style={[styles.badge, { backgroundColor, borderColor: ringColor }, style]}
        accessibilityRole="text"
        accessibilityLabel={`${count} acciones pendientes`}
      >
        <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.dot, { backgroundColor, borderColor: ringColor }, style]}
      accessibilityRole="image"
      accessibilityLabel="Acción pendiente"
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
