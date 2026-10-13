import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Send, Trash2, User } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import {
  LIMITE_COMENTARIO,
  borrarComentario,
  comentar,
  puedeBorrarComentario,
  traerComentarios,
  type Comentario,
} from '../services/publicaciones';

/** Comentarios de una publicación: se leen sin sesión; para comentar hay que haber iniciado sesión. */
export default function ComentariosDelPost({ postId }: { postId: string }) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const c = await traerComentarios(postId);
      if (c) {
        setLista(c);
        setError('');
      } else setError('No se pudieron cargar los comentarios.');
    } catch {
      setError('No se pudieron cargar los comentarios.');
    }
  }, [postId]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      const r = await comentar(postId, texto);
      if (r.ok) {
        setLista((prev) => [r.comentario, ...(prev || [])]);
        setTexto('');
      } else setError(r.mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const borrar = (c: Comentario) =>
    Alert.alert('Eliminar comentario', '¿Querés eliminar tu comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const r = await borrarComentario(postId, c.id);
          if (r.ok) setLista((prev) => (prev || []).filter((x) => x.id !== c.id));
          else setError(r.mensaje);
        },
      },
    ]);

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Comentarios{lista ? ` (${lista.length})` : ''}</Text>

      {isAuthenticated ? (
        <View style={styles.nuevo}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribí un comentario..."
            placeholderTextColor={themeColors.text.muted}
            multiline
            maxLength={LIMITE_COMENTARIO}
            style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border, backgroundColor: themeColors.card }]}
          />
          <TouchableOpacity
            onPress={enviar}
            disabled={enviando || !texto.trim()}
            accessibilityLabel="Enviar comentario"
            style={[styles.enviar, (enviando || !texto.trim()) && { opacity: 0.5 }]}
          >
            {enviando ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)}>
          <Text style={{ color: colors.primary[600], marginBottom: spacing.md }}>Iniciá sesión para comentar</Text>
        </TouchableOpacity>
      )}

      {!!error && <Text style={{ color: colors.danger[600], marginBottom: spacing.sm }}>{error}</Text>}

      {lista === null && !error && <ActivityIndicator color={colors.primary[600]} style={{ marginTop: spacing.md }} />}
      {lista !== null && lista.length === 0 && <Text style={{ color: themeColors.text.muted }}>Todavía no hay comentarios.</Text>}

      {(lista || []).map((c) => (
        <View key={c.id} style={[styles.comentario, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          {c.avatar ? <Image source={{ uri: c.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarVacio]}><User size={16} color={colors.primary[600]} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.autor, { color: themeColors.text.primary }]}>
              {c.autor}
              {!!c.createdAt && <Text style={{ color: themeColors.text.muted, fontWeight: fontWeight.normal }}>  ·  {new Date(c.createdAt).toLocaleDateString('es-AR')}</Text>}
            </Text>
            <Text style={[styles.contenido, { color: themeColors.text.secondary }]}>{c.content}</Text>
          </View>
          {puedeBorrarComentario(c, user?.id) && (
            <TouchableOpacity onPress={() => borrar(c)} accessibilityLabel="Eliminar comentario" style={{ padding: spacing.xs }}>
              <Trash2 size={18} color={colors.danger[600]} />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md },
  nuevo: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },
  input: { flex: 1, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, maxHeight: 120, fontSize: fontSize.base },
  enviar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary[600], justifyContent: 'center', alignItems: 'center' },
  comentario: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarVacio: { backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center' },
  autor: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  contenido: { fontSize: fontSize.sm, lineHeight: 20, marginTop: 2 },
});
