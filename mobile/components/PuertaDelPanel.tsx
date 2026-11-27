import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { get, post, setPaseDePanel } from '../services/api';
import { reconnect } from '../services/socket';

/**
 * La clave de panel en la app (pedido del dueño, 2026-11-26): las pantallas de administración se dibujan recién cuando está puesta. La clave se crea y se
 * recupera en la web.
 */
export default function PuertaDelPanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [paso, setPaso] = useState<'revisando' | 'abierta' | 'pedir' | 'sin-clave' | 'sin-respuesta'>('revisando');
  const [clave, setClave] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const revisar = useCallback(async () => {
    setPaso('revisando');
    const r = await get<any>('/clave-de-panel/estado');
    const e = r.data;
    // Un servidor que todavía no tiene la clave de panel (404) no la pide: la app sigue como siempre. Quien la exige es siempre el servidor.
    if ((r as { status?: number }).status === 404) setPaso('abierta');
    else if (!r.success || !e) {
      setAviso(r.message || 'No pudimos comprobar tu clave de panel.');
      setPaso('sin-respuesta');
    } else if (e.abierta || !e.exigida) setPaso('abierta');
    else setPaso(e.creada ? 'pedir' : 'sin-clave');
  }, []);
  useEffect(() => { void revisar(); }, [revisar]);

  const entrar = async () => {
    setEnviando(true);
    setAviso('');
    const r = await post<any>('/clave-de-panel/abrir', { clave: clave.trim(), paraLaApp: true });
    setEnviando(false);
    if (r.success && r.data?.pase) {
      await setPaseDePanel(r.data.pase);
      setClave('');
      await reconnect();
      setPaso('abierta');
    } else setAviso(r.message || 'La clave de panel no coincide.');
  };

  if (paso === 'abierta') return <>{children}</>;

  return (
    <View style={[styles.fondo, { backgroundColor: colors.background }]} testID="puerta-del-panel">
      <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {paso === 'revisando' && <ActivityIndicator color="#0284c7" />}
        {paso === 'sin-clave' && (
          <Text style={[styles.texto, { color: colors.text.secondary }]}>
            Para usar la administración necesitás tu clave de panel. Creala en la web: entrá a doapparg.com/admin, guardala y volvé acá.
          </Text>
        )}
        {paso === 'pedir' && (
          <>
            <Text style={[styles.titulo, { color: colors.text.primary }]}>Ingresá tu clave de panel</Text>
            <TextInput
              value={clave}
              onChangeText={setClave}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Tu clave de panel"
              placeholderTextColor={colors.text.muted}
              style={[styles.campo, { color: colors.text.primary, borderColor: colors.border }]}
            />
            <TouchableOpacity style={[styles.boton, (!clave || enviando) && styles.apagado]} disabled={!clave || enviando} onPress={() => { void entrar(); }}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.textoDelBoton}>Entrar al panel</Text>}
            </TouchableOpacity>
            <Text style={[styles.nota, { color: colors.text.muted }]}>Si la perdiste, generá una nueva desde la web.</Text>
          </>
        )}
        {!!aviso && <Text style={[styles.texto, { color: colors.text.primary }]}>{aviso}</Text>}
        {(paso === 'sin-clave' || paso === 'sin-respuesta') && (
          <TouchableOpacity style={styles.boton} onPress={() => { setAviso(''); void revisar(); }}>
            <Text style={styles.textoDelBoton}>Probar de nuevo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)}>
          <Text style={[styles.nota, { color: colors.text.muted }]}>Volver a DOAPP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'center', padding: 20 },
  tarjeta: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  titulo: { fontSize: 17, fontWeight: '700' },
  texto: { fontSize: 14, lineHeight: 20 },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  boton: { backgroundColor: '#0284c7', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  apagado: { opacity: 0.5 },
  textoDelBoton: { color: '#fff', fontWeight: '600', fontSize: 15 },
  nota: { fontSize: 13, textAlign: 'center' },
});
