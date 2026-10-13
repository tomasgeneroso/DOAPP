import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, Search } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import {
  etiquetaDeCategoria,
  listarArticulos,
  traerCategorias,
  type ArticuloDeLista,
} from '../../services/articulos';

/** Blog de DOAPP: artículos oficiales y de la comunidad. Se lee sin sesión. */
export default function ArticulosScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [categorias, setCategorias] = useState<{ nombre: string; cantidad: number }[]>([]);
  const [categoria, setCategoria] = useState('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [articulos, setArticulos] = useState<ArticuloDeLista[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const pedido = useRef(0);

  useEffect(() => {
    traerCategorias().then((c) => c && setCategorias(c)).catch(() => {});
  }, []);

  // Una búsqueda por vez: si la persona sigue escribiendo, la respuesta vieja se descarta.
  const cargar = useCallback(async (nueva: number, reemplazar: boolean) => {
    const numero = ++pedido.current;
    try {
      const r = await listarArticulos({ categoria, busqueda, pagina: nueva });
      if (numero !== pedido.current) return;
      if (r) {
        setArticulos((prev) => (reemplazar ? r.articulos : [...prev, ...r.articulos]));
        setPagina(r.pagina);
        setPaginas(r.paginas);
        setError('');
      } else setError('No se pudieron cargar los artículos.');
    } catch {
      if (numero === pedido.current) setError('No se pudieron cargar los artículos.');
    } finally {
      if (numero === pedido.current) {
        setCargando(false);
        setCargandoMas(false);
        setRefrescando(false);
      }
    }
  }, [categoria, busqueda]);

  useEffect(() => {
    setCargando(true);
    cargar(1, true);
  }, [cargar]);

  const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');

  return (
    <Pantalla
      titulo="Blog"
      volverA="/(tabs)"
      cargando={cargando && articulos.length === 0}
      error={error}
      onRefrescar={() => { setRefrescando(true); cargar(1, true); }}
      refrescando={refrescando}
    >
      <View style={[styles.busqueda, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <Search size={18} color={themeColors.text.muted} />
        <TextInput
          value={texto}
          onChangeText={setTexto}
          onSubmitEditing={() => setBusqueda(texto.trim())}
          returnKeyType="search"
          placeholder="Buscar artículos"
          placeholderTextColor={themeColors.text.muted}
          style={[styles.input, { color: themeColors.text.primary }]}
        />
      </View>

      {categorias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[{ nombre: '', cantidad: 0 }, ...categorias].map((c) => {
              const activa = categoria === c.nombre;
              return (
                <TouchableOpacity
                  key={c.nombre || 'todas'}
                  onPress={() => setCategoria(c.nombre)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activa }}
                  style={[styles.chip, { borderColor: activa ? colors.primary[600] : themeColors.border, backgroundColor: activa ? colors.primary[50] : 'transparent' }]}
                >
                  <Text style={{ color: activa ? colors.primary[700] : themeColors.text.primary }}>{c.nombre ? etiquetaDeCategoria(c.nombre) : 'Todos'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {!cargando && !error && articulos.length === 0 && <Text style={[styles.vacio, { color: themeColors.text.muted }]}>No hay artículos para mostrar.</Text>}

      {articulos.map((a) => (
        <TouchableOpacity
          key={`${a.postType}-${a.id}`}
          onPress={() => router.push(`/articulos/${encodeURIComponent(a.slug)}` as any)}
          style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          accessibilityRole="button"
        >
          {!!a.coverImage && <Image source={{ uri: a.coverImage }} style={styles.portada} resizeMode="cover" />}
          <View style={{ padding: spacing.md }}>
            <Text style={[styles.categoria, { color: colors.primary[600] }]}>{etiquetaDeCategoria(a.category)}</Text>
            <Text style={[styles.titulo, { color: themeColors.text.primary }]}>{a.title}</Text>
            {!!a.excerpt && <Text style={[styles.resumen, { color: themeColors.text.secondary }]} numberOfLines={3}>{a.excerpt}</Text>}
            <View style={styles.pie}>
              <Clock size={13} color={themeColors.text.muted} />
              <Text style={[styles.dato, { color: themeColors.text.muted }]}>
                {a.readingTime} min{a.autor ? ` · ${a.autor}` : ''}{fecha(a.publishedAt || a.createdAt) ? ` · ${fecha(a.publishedAt || a.createdAt)}` : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {pagina < paginas && (
        <TouchableOpacity
          onPress={() => { setCargandoMas(true); cargar(pagina + 1, false); }}
          disabled={cargandoMas}
          style={[styles.mas, { borderColor: themeColors.border }]}
        >
          {cargandoMas ? <ActivityIndicator color={colors.primary[600]} /> : <Text style={{ color: colors.primary[700], fontWeight: fontWeight.medium }}>Ver más artículos</Text>}
        </TouchableOpacity>
      )}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  busqueda: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md },
  input: { flex: 1, height: 44, fontSize: fontSize.base },
  chip: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  vacio: { textAlign: 'center', marginTop: spacing['2xl'] },
  tarjeta: { borderWidth: 1, borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.md },
  portada: { width: '100%', height: 150 },
  categoria: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase' },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: 2 },
  resumen: { fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.xs },
  pie: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  dato: { fontSize: fontSize.xs },
  mas: { borderWidth: 1, borderRadius: borderRadius.lg, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
});
