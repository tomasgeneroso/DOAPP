import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gift, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { canjearInvitacion, consultarInvitacion, normalizarCodigo, type ConsultaDeLaInvitacion } from '../../services/invitaciones';

/**
 * Enlace de invitación de un creador de contenido (`doapp://invitacion/INF-…` o desde «Tengo una invitación»).
 * Es de un solo uso: quien lo canjea no paga la comisión de DOAPP por sus contratos como Cliente durante el plazo de la
 * invitación (Términos 7.11). Esta pantalla cuenta si el enlace sirve y manda a registrarse o a canjearlo.
 */
export default function InvitacionScreen() {
  const { codigo: crudo } = useLocalSearchParams<{ codigo: string }>();
  const codigo = normalizarCodigo(crudo);
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();
  const [consulta, setConsulta] = useState<ConsultaDeLaInvitacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [canjeando, setCanjeando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const cargar = useCallback(async () => {
    if (!codigo) {
      setConsulta({ valida: false, mensaje: 'Esta invitación no existe. Revisá el enlace.' });
      setCargando(false);
      return;
    }
    try {
      setConsulta(await consultarInvitacion(codigo));
    } catch {
      setConsulta({ valida: false, mensaje: 'No pudimos revisar la invitación. Probá de nuevo.' });
    } finally {
      setCargando(false);
    }
  }, [codigo]);

  useEffect(() => { cargar(); }, [cargar]);

  const canjear = async () => {
    if (!codigo) return;
    setCanjeando(true);
    setResultado(null);
    try {
      const r = await canjearInvitacion(codigo);
      setResultado({ ok: r.ok, mensaje: r.mensaje });
    } catch {
      setResultado({ ok: false, mensaje: 'No se pudo activar la invitación. Probá de nuevo.' });
    } finally {
      setCanjeando(false);
    }
  };

  const crearCuenta = () => router.push({ pathname: '/(auth)/register', params: { invitacion: codigo } } as any);
  const iniciarSesion = () => router.push('/(auth)/login' as any);

  return (
    <Pantalla titulo="Invitación" cargando={cargando} volverA="/(tabs)">
      {consulta?.valida ? (
        <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={[styles.circulo, { backgroundColor: colors.primary[50] }]}>
            <Gift size={34} color={colors.primary[600]} />
          </View>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>
            {consulta.influencer ? `${consulta.influencer} te invitó a DOAPP` : 'Te invitaron a DOAPP'}
          </Text>
          <Text style={[styles.texto, { color: themeColors.text.secondary }]}>
            Contratá servicios sin pagar la comisión de DOAPP durante {consulta.dias} días desde que activás la invitación.
          </Text>

          <View style={styles.punto}><ShieldCheck size={18} color={colors.success[600]} /><Text style={[styles.puntoTexto, { color: themeColors.text.secondary }]}>El pago queda protegido hasta que el trabajo se termina.</Text></View>
          <View style={styles.punto}><CheckCircle size={18} color={colors.success[600]} /><Text style={[styles.puntoTexto, { color: themeColors.text.secondary }]}>Vale para tus contratos como Cliente. No incluye el costo de procesamiento del pago ni los impuestos.</Text></View>
          <View style={styles.punto}><CheckCircle size={18} color={colors.success[600]} /><Text style={[styles.puntoTexto, { color: themeColors.text.secondary }]}>Esta invitación es de un solo uso y cada cuenta puede activar una.</Text></View>

          {!!resultado && (
            <Text style={[styles.resultado, { backgroundColor: resultado.ok ? colors.success[50] : colors.warning[50], color: resultado.ok ? colors.success[700] : colors.slate[800] }]}>
              {resultado.mensaje}
            </Text>
          )}

          {isAuthenticated ? (
            <TouchableOpacity style={[styles.boton, (canjeando || resultado?.ok) && { opacity: 0.6 }]} onPress={canjear} disabled={canjeando || resultado?.ok === true}>
              {canjeando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Activar en mi cuenta</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.boton} onPress={crearCuenta}>
                <Text style={styles.botonTexto}>Crear mi cuenta con la invitación</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={iniciarSesion} style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.primary[600], textAlign: 'center', fontSize: fontSize.sm }}>
                  ¿Ya tenés cuenta? Iniciá sesión y volvé a abrir el enlace para activarla
                </Text>
              </TouchableOpacity>
            </>
          )}
          <Text style={[styles.chico, { color: themeColors.text.muted }]}>Condiciones: Términos y condiciones, punto 7.11.</Text>
        </View>
      ) : (
        <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={[styles.circulo, { backgroundColor: colors.warning[50] }]}>
            <AlertCircle size={34} color={colors.warning[600]} />
          </View>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Esta invitación no se puede usar</Text>
          <Text style={[styles.texto, { color: themeColors.text.secondary }]}>{consulta?.mensaje || 'Revisá el enlace.'}</Text>
          {!isAuthenticated && (
            <TouchableOpacity style={styles.boton} onPress={() => router.push('/(auth)/register' as any)}>
              <Text style={styles.botonTexto}>Crear mi cuenta igual</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  tarjeta: { borderWidth: 1, borderRadius: borderRadius.xl, padding: spacing.xl },
  circulo: { alignSelf: 'center', width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  titulo: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
  texto: { fontSize: fontSize.base, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  punto: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'flex-start' },
  puntoTexto: { flex: 1, fontSize: fontSize.sm, lineHeight: 19 },
  resultado: { fontSize: fontSize.sm, padding: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.md },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  chico: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.lg },
});
