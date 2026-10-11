import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors } from '../constants/theme';
import {
  consultarPago,
  INTERVALO_MS,
  MAX_CONSULTAS,
  TEXTO_DEMORADO,
  type SeguimientoDelPago,
  type TipoDePago,
} from '../services/pagos';

/**
 * Lo que ve quien vuelve de pagar en Mercado Pago desde el celular.
 *
 * Mercado Pago devuelve a una página web, no a la app, así que la app tiene que confirmar el pago por su cuenta:
 * mientras no se ve reflejado muestra «Estamos confirmando tu pago» y consulta cada pocos segundos (y de inmediato
 * cuando la persona vuelve del navegador); cuando se refleja lo dice, con lo que sigue. Si pasa un minuto, lo dice con
 * honestidad y le pide que NO pague de nuevo. Es el equivalente del cartel de la web (`AvisoDeRetornoDePago`).
 */
export default function PagoEnCursoScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const params = useLocalSearchParams<{ tipo?: string; preferenceId?: string; jobId?: string; proposalId?: string; contractId?: string }>();

  const tipo = (params.tipo as TipoDePago) || 'publicacion';
  const [estado, setEstado] = useState<SeguimientoDelPago>({ fase: 'esperando' });
  const [consultas, setConsultas] = useState(0);
  const consultando = useRef(false);
  const faseRef = useRef<SeguimientoDelPago['fase']>('esperando');
  useEffect(() => {
    faseRef.current = estado.fase;
  }, [estado.fase]);

  const consultar = useCallback(async () => {
    if (consultando.current || faseRef.current !== 'esperando') return;
    consultando.current = true;
    try {
      const resultado = await consultarPago({
        tipo,
        preferenceId: params.preferenceId,
        jobId: params.jobId,
        proposalId: params.proposalId,
        contractId: params.contractId,
      });
      setEstado(resultado);
    } catch {
      /* se vuelve a intentar en el próximo ciclo */
    } finally {
      consultando.current = false;
      setConsultas((n) => n + 1);
    }
  }, [tipo, params.preferenceId, params.jobId, params.proposalId, params.contractId]);

  // El ciclo: mientras espera y no se agotó el minuto, una consulta cada pocos segundos.
  const agotado = estado.fase === 'esperando' && consultas >= MAX_CONSULTAS;
  useEffect(() => {
    if (estado.fase !== 'esperando' || agotado) return;
    const temporizador = setTimeout(consultar, consultas === 0 ? 1500 : INTERVALO_MS);
    return () => clearTimeout(temporizador);
  }, [estado.fase, agotado, consultas, consultar]);

  // Al volver del navegador a la app se consulta enseguida, sin esperar al próximo ciclo.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') consultar();
    });
    return () => suscripcion.remove();
  }, [consultar]);

  const destino = (): { etiqueta: string; ruta: string } | null => {
    if ((tipo === 'publicacion' || tipo === 'aumento') && params.jobId) return { etiqueta: 'Ver mi trabajo', ruta: `/job/${params.jobId}` };
    if (tipo === 'cotizacion' && params.proposalId) return { etiqueta: 'Ver la propuesta', ruta: `/proposals/${params.proposalId}` };
    if (tipo === 'contrato' && params.contractId) return { etiqueta: 'Ver el contrato', ruta: `/contracts/${params.contractId}` };
    return null;
  };
  const ir = destino();

  let Icono = Clock;
  let tono = colors.primary[600];
  let titulo = 'Estamos confirmando tu pago';
  let texto = 'Volviste de Mercado Pago y lo estamos registrando; puede tardar unos segundos. No hace falta que hagas nada ni que pagues de nuevo.';
  if (estado.fase === 'confirmado') {
    Icono = CheckCircle;
    tono = '#059669';
    titulo = estado.titulo;
    texto = estado.texto;
  } else if (estado.fase === 'problema') {
    Icono = AlertCircle;
    tono = '#d97706';
    titulo = estado.titulo;
    texto = estado.texto;
  } else if (agotado) {
    Icono = AlertCircle;
    tono = '#d97706';
    titulo = TEXTO_DEMORADO.titulo;
    texto = TEXTO_DEMORADO.texto;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.center}>
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]} accessibilityLiveRegion="polite">
          {estado.fase === 'esperando' && !agotado ? (
            <ActivityIndicator color={tono} size="large" style={{ marginBottom: 12 }} />
          ) : (
            <Icono size={44} color={tono} style={{ marginBottom: 12 }} />
          )}
          <Text style={[styles.title, { color: themeColors.text.primary }]}>{titulo}</Text>
          <Text style={[styles.text, { color: themeColors.text.secondary }]}>{texto}</Text>

          {agotado && (
            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: themeColors.border }]} onPress={() => setConsultas(0)}>
              <Text style={[styles.secondaryText, { color: themeColors.text.primary }]}>Volver a consultar</Text>
            </TouchableOpacity>
          )}
          {ir && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace(ir.ruta as any)}>
              <Text style={styles.primaryText}>{ir.etiqueta}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/(tabs)' as any)}>
            <Text style={[styles.linkText, { color: themeColors.text.secondary }]}>Ir al inicio</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  text: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  primaryBtn: { backgroundColor: colors.primary[600], borderRadius: 14, height: 50, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderRadius: 14, height: 46, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  linkBtn: { paddingVertical: 14 },
  linkText: { fontSize: 14 },
});
