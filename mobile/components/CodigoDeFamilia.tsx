import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Users } from 'lucide-react-native';
import { post } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Canje del código de familia con la cuenta ya creada (regla del dueño, 2026-11-12: también con Google o X, o ya registrado). Va en
 * Configuración → Seguridad. El servidor acepta el código con o sin «FAM-», en mayúsculas o minúsculas.
 */
export default function CodigoDeFamilia() {
  const { colors: themeColors } = useTheme();
  const { user, refreshUser } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const activo = !!(user as any)?.hasFamilyPlan;

  const canjear = async () => {
    if (!codigo.trim() || enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const r: any = await post('/auth/activate-family-code', { code: codigo });
      if (r?.success) {
        setResultado({ ok: true, texto: r.message || 'Plan Familia activado.' });
        setCodigo('');
        if (refreshUser) await refreshUser();
      } else {
        setResultado({ ok: false, texto: r?.message || 'No se pudo activar el código. Probá de nuevo.' });
      }
    } catch (e: any) {
      setResultado({ ok: false, texto: e?.message || 'No pudimos conectarnos. Probá de nuevo.' });
    } finally {
      setEnviando(false);
    }
  };

  if (activo && !resultado) {
    return <Text style={{ color: colors.success[700], fontSize: fontSize.sm }}>Plan Familia activo: 0% de comisión en tus contratos.</Text>;
  }

  return (
    <View>
      <View style={styles.titulo}>
        <Users size={16} color={themeColors.text.secondary} strokeWidth={2} />
        <Text style={{ color: themeColors.text.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>¿Tenés un código de familia?</Text>
      </View>
      <Text style={{ color: themeColors.text.muted, fontSize: fontSize.xs, marginTop: 2 }}>
        Pegalo acá, con o sin «FAM-». Activa el Plan Familia: 0% de comisión en tus contratos.
      </Text>
      <View style={styles.fila}>
        <TextInput
          style={[styles.input, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
          placeholder="FAM-ABCD2345"
          placeholderTextColor={themeColors.text.muted}
          value={codigo}
          onChangeText={(v) => setCodigo(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          onSubmitEditing={canjear}
        />
        <TouchableOpacity style={[styles.boton, (enviando || !codigo.trim()) && { opacity: 0.5 }]} onPress={canjear} disabled={enviando || !codigo.trim()} activeOpacity={0.8}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Activar</Text>}
        </TouchableOpacity>
      </View>
      {resultado && (
        <Text style={{ marginTop: spacing.sm, fontSize: fontSize.sm, color: resultado.ok ? colors.success[700] : colors.danger[600] }}>{resultado.texto}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fila: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minWidth: 84, alignItems: 'center' },
  botonTexto: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
});
