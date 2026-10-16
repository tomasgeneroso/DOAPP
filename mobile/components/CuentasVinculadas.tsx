import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator, Animated, AppState } from 'react-native';
import { Link2, CheckCircle2 } from 'lucide-react-native';
import { iniciarVinculo, obtenerVinculos } from '../services/auth';
import { NOMBRE_DEL_PROVEEDOR, type ProveedorSocial } from '../services/ingresoSocial';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Cuentas enlazadas (Configuración → Seguridad): enlazar Google o X a una cuenta creada con correo y contraseña, para que
 * «Ingresar con Google» abra ESTA cuenta y no cree otra. El enlace se hace en el navegador del teléfono y lo confirma la app al
 * volver (ver app/vinculo-callback.tsx).
 */
export default function CuentasVinculadas() {
  const { colors: themeColors } = useTheme();
  const [vinculos, setVinculos] = useState<{ google: boolean; twitter: boolean } | null>(null);
  const [trabajando, setTrabajando] = useState<ProveedorSocial | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const aparece = useRef(new Animated.Value(0)).current;

  const cargar = useCallback(async () => {
    try {
      const v = await obtenerVinculos();
      if (v) setVinculos({ google: v.google, twitter: v.twitter });
    } catch {
      /* sin respuesta no se muestra el estado */
    }
  }, []);

  useEffect(() => {
    cargar();
    // Al volver del navegador (o de la confirmación) se vuelve a leer qué quedó enlazado.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') cargar();
    });
    return () => sub.remove();
  }, [cargar]);

  useEffect(() => {
    aparece.setValue(0);
    if (msg) Animated.timing(aparece, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [msg, aparece]);

  const enlazar = async (proveedor: ProveedorSocial) => {
    setMsg(null);
    setTrabajando(proveedor);
    try {
      const r = await iniciarVinculo(proveedor);
      if (r.success && r.url) {
        await Linking.openURL(r.url);
        setMsg({ tipo: 'ok', texto: `Elegí tu cuenta de ${NOMBRE_DEL_PROVEEDOR[proveedor]} en el navegador y volvé a la app cuando te lo pida.` });
      } else {
        setMsg({ tipo: 'error', texto: r.message || 'No pudimos empezar el enlace.' });
      }
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e?.message || 'No pudimos empezar el enlace. Revisá tu conexión.' });
    } finally {
      setTrabajando(null);
    }
  };

  if (!vinculos) return null;

  const fila = (proveedor: ProveedorSocial) => {
    const enlazada = vinculos[proveedor];
    return (
      <View key={proveedor} style={styles.fila}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nombre, { color: themeColors.text.primary }]}>{NOMBRE_DEL_PROVEEDOR[proveedor]}</Text>
          <Text style={[styles.estado, { color: enlazada ? '#059669' : themeColors.text.muted }]}>{enlazada ? 'Enlazada' : 'Sin enlazar'}</Text>
        </View>
        {enlazada ? (
          <CheckCircle2 size={22} color="#059669" />
        ) : (
          <TouchableOpacity
            style={[styles.boton, trabajando === proveedor && { opacity: 0.6 }]}
            onPress={() => enlazar(proveedor)}
            disabled={trabajando !== null}
            accessibilityLabel={`Enlazar ${NOMBRE_DEL_PROVEEDOR[proveedor]}`}
          >
            {trabajando === proveedor ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.botonTexto}>Enlazar</Text>}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Link2 size={18} color={themeColors.text.secondary} />
        <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Cuentas enlazadas</Text>
      </View>
      <Text style={[styles.ayuda, { color: themeColors.text.muted }]}>
        Enlazá Google o X: así «Ingresar con Google» abre esta misma cuenta y no una nueva.
      </Text>
      {msg && (
        <Animated.View
          style={[styles.msg, { opacity: aparece, backgroundColor: msg.tipo === 'ok' ? '#ecfdf5' : '#fef2f2', borderColor: msg.tipo === 'ok' ? '#a7f3d0' : '#fecaca' }]}
          accessibilityRole={msg.tipo === 'error' ? 'alert' : undefined}
        >
          <Text style={{ color: msg.tipo === 'ok' ? '#065f46' : '#991b1b', fontSize: fontSize.sm }}>{msg.texto}</Text>
        </Animated.View>
      )}
      {(['google', 'twitter'] as ProveedorSocial[]).map(fila)}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  ayuda: { fontSize: fontSize.sm },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  nombre: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  estado: { fontSize: fontSize.xs },
  boton: { backgroundColor: colors.primary[600], paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, minWidth: 84, alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  msg: { padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1 },
});
