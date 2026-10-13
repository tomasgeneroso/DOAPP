import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Pantalla from '../../../components/Pantalla';
import { useTheme } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../constants/theme';
import {
  advertenciaDeAceptar,
  etiquetaDelEstadoDeLaSolicitud,
  etiquetaDelTipo,
  leerSolicitud,
  puedeResponder,
  responderSolicitud,
  traerSolicitud,
  type SolicitudDeCambio,
} from '../../../services/solicitudesDeCambio';

/** Una solicitud de cambio o cancelación de un contrato: lo que se pidió y por qué, y aceptarla o rechazarla. */
export default function SolicitudDeCambioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const [s, setS] = useState<SolicitudDeCambio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [respondiendo, setRespondiendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const r = leerSolicitud(await traerSolicitud(String(id)));
      if (r) {
        setS(r);
        setError('');
      } else setError('No se encontró la solicitud (o no sos parte del contrato).');
    } catch {
      setError('No se pudo cargar la solicitud.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const responder = (aceptar: boolean) => {
    if (!s) return;
    Alert.alert(
      aceptar ? 'Aceptar la solicitud' : 'Rechazar la solicitud',
      aceptar ? advertenciaDeAceptar(s) : 'La otra parte recibe el aviso de que la rechazaste.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: aceptar ? 'Aceptar' : 'Rechazar',
          style: aceptar && s.type === 'cancel' ? 'destructive' : 'default',
          onPress: async () => {
            setRespondiendo(true);
            try {
              const r = await responderSolicitud(String(id), aceptar);
              if (r.ok) {
                Alert.alert('Listo', r.mensaje);
                if (s.contract?.id) router.replace(`/contracts/${s.contract.id}` as any);
                else await cargar();
              } else setError(r.mensaje);
            } finally {
              setRespondiendo(false);
            }
          },
        },
      ],
    );
  };

  const color = s?.status === 'accepted' ? colors.success[700] : s?.status === 'rejected' ? colors.danger[600] : colors.warning[600];
  const fila = (etiqueta: string, valor?: string | null) =>
    valor ? (
      <View style={styles.fila}>
        <Text style={[styles.etiqueta, { color: themeColors.text.secondary }]}>{etiqueta}</Text>
        <Text style={[styles.valor, { color: themeColors.text.primary }]}>{valor}</Text>
      </View>
    ) : null;

  return (
    <Pantalla titulo="Solicitud sobre el contrato" cargando={cargando} error={s ? undefined : error} volverA="/contracts">
      {s && (
        <>
          <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.titulo, { color: themeColors.text.primary }]}>{etiquetaDelTipo(s.type)}</Text>
            <Text style={{ color, fontWeight: fontWeight.semibold, marginTop: 2 }}>{etiquetaDelEstadoDeLaSolicitud(s.status)}</Text>
            {fila('Trabajo', s.contract?.job?.title)}
            {fila('Pidió', s.requestedBy?.name)}
            {fila('Fecha', s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-AR') : null)}
            {s.contract?.price !== undefined && fila('Precio del contrato', `$${Number(s.contract.price).toLocaleString('es-AR')}`)}
          </View>

          <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.etiqueta, { color: themeColors.text.secondary }]}>Motivo</Text>
            <Text style={[styles.motivo, { color: themeColors.text.primary }]}>{s.reason}</Text>
          </View>

          {s.type === 'modify' && !!s.newTerms && (
            <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Nuevos términos que se piden</Text>
              {s.newTerms.price !== undefined && fila('Precio', `$${Number(s.newTerms.price).toLocaleString('es-AR')}`)}
              {fila('Inicio', s.newTerms.startDate ? new Date(s.newTerms.startDate).toLocaleDateString('es-AR') : null)}
              {fila('Fin', s.newTerms.endDate ? new Date(s.newTerms.endDate).toLocaleDateString('es-AR') : null)}
              {fila('Descripción', s.newTerms.description)}
            </View>
          )}

          {s.status !== 'pending' && !!s.respondedBy && (
            <Text style={[styles.valor, { color: themeColors.text.secondary, marginBottom: spacing.md }]}>
              Respondió {s.respondedBy.name}{s.respondedAt ? ` el ${new Date(s.respondedAt).toLocaleDateString('es-AR')}` : ''}.
            </Text>
          )}
          {s.status === 'escalated_to_support' && (
            <Text style={[styles.valor, { color: themeColors.text.secondary, marginBottom: spacing.md }]}>
              Pasaron dos días sin respuesta: soporte la revisa.
            </Text>
          )}

          {!!error && <Text style={{ color: colors.danger[600], marginBottom: spacing.md }}>{error}</Text>}

          {puedeResponder(s, user?.id) && (
            <>
              <TouchableOpacity style={[styles.boton, respondiendo && { opacity: 0.6 }]} onPress={() => responder(true)} disabled={respondiendo}>
                {respondiendo ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Aceptar</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.botonSecundario, { borderColor: colors.danger[600] }]} onPress={() => responder(false)} disabled={respondiendo}>
                <Text style={{ color: colors.danger[600], fontWeight: fontWeight.semibold }}>Rechazar</Text>
              </TouchableOpacity>
            </>
          )}

          {!!s.contract?.id && (
            <TouchableOpacity onPress={() => router.push(`/contracts/${s.contract!.id}` as any)} style={{ marginTop: spacing.lg }}>
              <Text style={{ color: colors.primary[600], textAlign: 'center' }}>Ver el contrato</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  etiqueta: { fontSize: fontSize.sm },
  valor: { fontSize: fontSize.sm, flexShrink: 1, textAlign: 'right' },
  motivo: { fontSize: fontSize.base, lineHeight: 22, marginTop: spacing.xs },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  botonSecundario: { borderWidth: 1, borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
});
