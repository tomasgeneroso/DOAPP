import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { alAvisarUnaFalla } from '../services/redDeErrores';

const DURA_MS = 7000;

/** El cartel de lo que ninguna pantalla mostró (ver `services/redDeErrores.ts`). Entra y sale con transición; se cierra al tocarlo. */
export default function AvisoDeError() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const opacidad = useRef(new Animated.Value(0)).current;
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cerrar = () => {
    Animated.timing(opacidad, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMensaje(null));
  };

  useEffect(() => {
    const baja = alAvisarUnaFalla((m) => {
      if (reloj.current) clearTimeout(reloj.current);
      setMensaje(m);
      Animated.timing(opacidad, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      reloj.current = setTimeout(cerrar, DURA_MS);
    });
    return () => {
      baja();
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mensaje) return null;
  return (
    <Animated.View style={[styles.contenedor, { opacity: opacidad }]} accessibilityRole="alert">
      <Pressable onPress={cerrar} style={styles.caja} accessibilityLabel="Cerrar aviso">
        <Text style={styles.titulo}>Algo no salió bien</Text>
        <Text style={styles.texto}>{mensaje}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contenedor: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 96, zIndex: 100, elevation: 20 },
  caja: { backgroundColor: colors.danger[600], borderRadius: borderRadius.lg, padding: spacing.md },
  titulo: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: 2 },
  texto: { color: '#fff', fontSize: fontSize.sm, lineHeight: 19 },
});
