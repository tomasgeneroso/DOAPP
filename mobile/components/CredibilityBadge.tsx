import React from 'react';
import { View, Text } from 'react-native';
import { ShieldCheck, Check, Lock } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

export interface CredibilityInfo {
  score: number;
  max: number;
  isProfessional: boolean;
  breakdown: Array<{ level: number; label: string; achieved: boolean }>;
}

const TIER_LABEL = ['Sin verificar', 'Básica', 'Confiable', 'Profesional', 'Profesional +'];

export default function CredibilityBadge({
  credibility,
  variant = 'compact',
}: {
  credibility?: CredibilityInfo | null;
  variant?: 'compact' | 'full';
}) {
  const { colors }: any = useTheme();
  if (!credibility) return null;
  const { score, max, breakdown } = credibility;
  const label = TIER_LABEL[Math.max(0, Math.min(TIER_LABEL.length - 1, score))];
  const accent = score >= 3 ? colors.success : score >= 2 ? colors.primary[500] : score >= 1 ? colors.warning : colors.slate[400];

  if (variant === 'compact') {
    return (
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
          backgroundColor: colors.primary[50], paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
        }}
      >
        <ShieldCheck size={14} color={accent} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>
          Credibilidad {score}/{max} · {label}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={20} color={accent} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.primary }}>Credibilidad del perfil</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>{score}/{max} · {label}</Text>
      </View>

      {/* progress bar */}
      <View style={{ height: 8, borderRadius: 8, backgroundColor: colors.slate[200], overflow: 'hidden', marginBottom: 14 }}>
        <View style={{ height: '100%', width: `${max ? (score / max) * 100 : 0}%`, backgroundColor: accent, borderRadius: 8 }} />
      </View>

      {/* checklist */}
      <View style={{ gap: 8 }}>
        {breakdown.map((b) => (
          <View key={b.level} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                backgroundColor: b.achieved ? colors.success : colors.slate[200],
              }}
            >
              {b.achieved ? <Check size={12} color="#fff" /> : <Lock size={12} color={colors.slate[400]} />}
            </View>
            <Text style={{ fontSize: 14, color: b.achieved ? colors.text.primary : colors.text.muted }}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
