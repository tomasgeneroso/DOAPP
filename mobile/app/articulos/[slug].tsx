import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, Eye } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { etiquetaDeCategoria, htmlABloques, traerArticulo, type Articulo } from '../../services/articulos';

/** Un artículo del blog. El contenido se muestra como bloques de texto e imágenes (sin dibujar HTML). */
export default function ArticuloScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [articulo, setArticulo] = useState<Articulo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const a = await traerArticulo(String(Array.isArray(slug) ? slug[0] : slug));
        if (!vigente) return;
        if (a) setArticulo(a);
        else setError('No se encontró el artículo.');
      } catch {
        if (vigente) setError('No se pudo cargar el artículo. Revisá tu conexión.');
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [slug]);

  const bloques = articulo ? htmlABloques(articulo.content) : [];
  const fecha = articulo?.publishedAt || articulo?.createdAt;

  return (
    <Pantalla titulo="Artículo" cargando={cargando} error={articulo ? undefined : error} volverA="/articulos">
      {!!articulo && (
        <>
          {!!articulo.coverImage && <Image source={{ uri: articulo.coverImage }} style={styles.portada} resizeMode="cover" />}
          <Text style={[styles.categoria, { color: colors.primary[600] }]}>{etiquetaDeCategoria(articulo.category)}</Text>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>{articulo.title}</Text>
          {!!articulo.subtitle && <Text style={[styles.subtitulo, { color: themeColors.text.secondary }]}>{articulo.subtitle}</Text>}
          <View style={styles.meta}>
            {!!articulo.autor && <Text style={[styles.dato, { color: themeColors.text.muted }]}>{articulo.autor}</Text>}
            {!!fecha && <Text style={[styles.dato, { color: themeColors.text.muted }]}>{new Date(fecha).toLocaleDateString('es-AR')}</Text>}
            <View style={styles.dato2}><Clock size={13} color={themeColors.text.muted} /><Text style={[styles.dato, { color: themeColors.text.muted }]}>{articulo.readingTime} min</Text></View>
            <View style={styles.dato2}><Eye size={13} color={themeColors.text.muted} /><Text style={[styles.dato, { color: themeColors.text.muted }]}>{articulo.views}</Text></View>
          </View>

          {bloques.map((b, i) => {
            if (b.tipo === 'imagen') return <Image key={i} source={{ uri: b.url }} accessibilityLabel={b.descripcion} style={styles.imagen} resizeMode="contain" />;
            if (b.tipo === 'titulo') return <Text key={i} style={[styles.encabezado, { color: themeColors.text.primary }]}>{b.texto}</Text>;
            if (b.tipo === 'item') return <Text key={i} style={[styles.parrafo, { color: themeColors.text.primary, marginLeft: spacing.md, marginBottom: spacing.xs }]}>{'•  '}{b.texto}</Text>;
            if (b.tipo === 'cita') return <Text key={i} style={[styles.cita, { color: themeColors.text.secondary, borderLeftColor: colors.primary[400] }]}>{b.texto}</Text>;
            return <Text key={i} style={[styles.parrafo, { color: themeColors.text.primary }]}>{b.texto}</Text>;
          })}
          {bloques.length === 0 && <Text style={[styles.parrafo, { color: themeColors.text.muted }]}>Este artículo no tiene contenido para mostrar.</Text>}

          {articulo.tags.length > 0 && (
            <View style={styles.etiquetas}>
              {articulo.tags.map((t) => (
                <View key={t} style={[styles.etiqueta, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
                  <Text style={{ color: themeColors.text.secondary, fontSize: fontSize.xs }}>#{t}</Text>
                </View>
              ))}
            </View>
          )}

          {articulo.postType === 'user' && (
            <TouchableOpacity onPress={() => router.push(`/blog/${articulo.id}` as any)} style={[styles.comentarios, { borderColor: themeColors.border }]}>
              <Text style={{ color: colors.primary[700], fontWeight: fontWeight.medium }}>Ver comentarios y dar me gusta</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  portada: { width: '100%', height: 190, borderRadius: borderRadius.lg, marginBottom: spacing.md },
  categoria: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase' },
  titulo: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, marginTop: 2 },
  subtitulo: { fontSize: fontSize.base, marginTop: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  dato: { fontSize: fontSize.xs },
  dato2: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  encabezado: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
  parrafo: { fontSize: fontSize.base, lineHeight: 24, marginBottom: spacing.md },
  cita: { fontSize: fontSize.base, lineHeight: 24, fontStyle: 'italic', borderLeftWidth: 3, paddingLeft: spacing.md, marginBottom: spacing.md },
  imagen: { width: '100%', height: 200, marginBottom: spacing.md },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  etiqueta: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  comentarios: { borderWidth: 1, borderRadius: borderRadius.lg, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
});
