import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Modal, ScrollView } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { get, post } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { claveDelCambio, type CambioDePoliticas } from '../../shared/legal/cambiosDePoliticas';

/** El aviso de un cambio significativo de las políticas, una vez a cada persona (el mismo que en la web: lo decide el servidor). */
export default function AvisoDePoliticas({ conSesion }: { conSesion: boolean }) {
  const { colors: tema } = useTheme();
  const router = useRouter();
  const ruta = usePathname();
  const [cambio, setCambio] = useState<CambioDePoliticas | null>(null);
  const aparece = useRef(new Animated.Value(0)).current;

  const cargar = useCallback(async () => {
    try {
      const r: any = await get('/momentos');
      setCambio(r?.success ? r.data?.cambioDePoliticas ?? null : null);
    } catch {
      /* sin conexión se vuelve a preguntar al abrir la app */
    }
  }, []);

  useEffect(() => {
    if (conSesion) void cargar();
    else setCambio(null);
  }, [conSesion, cargar]);

  useEffect(() => {
    aparece.setValue(0);
    if (cambio) Animated.timing(aparece, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [cambio, aparece]);

  // Mientras se lee el documento, el aviso no lo tapa.
  if (!cambio || ruta.startsWith('/legal')) return null;

  const entendido = () => {
    const clave = claveDelCambio(cambio.version);
    setCambio(null);
    void post('/momentos/visto', { clave }).catch(() => undefined);
  };
  const leer = () => {
    router.push('/legal/privacy' as any);
  };

  return (
    <Modal transparent animationType="none" visible onRequestClose={entendido}>
      <Animated.View style={[styles.fondo, { opacity: aparece }]}>
        <View style={[styles.caja, { backgroundColor: tema.background }]} accessibilityRole="alert">
          <Text style={[styles.titulo, { color: tema.text.primary }]}>{cambio.titulo}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {cambio.puntos.map((p) => (
              <Text key={p} style={[styles.punto, { color: tema.text.secondary }]}>• {p}</Text>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.principal} onPress={entendido}>
            <Text style={styles.textoPrincipal}>Entendido</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secundario} onPress={leer}>
            <Text style={[styles.textoSecundario, { color: tema.text.primary }]}>Leer la política</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  caja: { padding: spacing.xl, gap: spacing.md, borderTopLeftRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  punto: { fontSize: fontSize.base, marginBottom: spacing.sm },
  principal: { backgroundColor: colors.primary[600], padding: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  textoPrincipal: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  secundario: { padding: spacing.sm, alignItems: 'center' },
  textoSecundario: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
});
