import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CheckCircle, AlertCircle, Copy, Key, FileCheck } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import {
  aceptarElContrato,
  codigoCompleto,
  confirmarElCodigo,
  generarElCodigo,
  iniciarSinCodigo,
  largoEsperadoDelCodigo,
  mostrarEmparejamiento,
  normalizarCodigo,
  puedeAceptarElContrato,
  puedeConfirmarMiParte,
  puedeGenerarElCodigo,
  sugerirInicioSinCodigo,
  type ResultadoDeEmparejar,
} from '../services/emparejamiento';

/**
 * Aceptar el contrato y emparejarse con el código, desde el celular.
 *
 * Dos pasos seguidos del mismo flujo: cuando administración aprueba el contrato, las dos partes lo aceptan; y dentro de
 * las 24 horas antes del inicio, cada parte confirma el código de emparejamiento y el trabajo empieza. Las reglas viven
 * en `services/emparejamiento.ts` (y en el servidor, que es quien decide); esto sólo dibuja lo que corresponde.
 */
export default function EmparejamientoDelContrato({
  contract,
  isClient,
  isDoer,
  onChanged,
}: {
  contract: any;
  isClient: boolean;
  isDoer: boolean;
  onChanged: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const [trabajando, setTrabajando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [ofrecerSinCodigo, setOfrecerSinCodigo] = useState(false);
  const id = String(contract?.id || contract?._id || '');

  const ejecutar = async (accion: () => Promise<ResultadoDeEmparejar>, despues?: (r: ResultadoDeEmparejar) => void) => {
    if (trabajando) return;
    setTrabajando(true);
    setMensaje(null);
    try {
      const r = await accion();
      setMensaje({ texto: r.mensaje, error: !r.ok });
      despues?.(r);
      if (r.ok) onChanged();
    } catch (e: any) {
      setMensaje({ texto: e?.message || 'No se pudo completar. Probá de nuevo en un momento.', error: true });
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async () => {
    await Clipboard.setStringAsync(String(contract.pairingCode));
    setMensaje({ texto: 'Código copiado.', error: false });
  };

  const confirmarSinCodigo = () =>
    Alert.alert(
      'Iniciar sin verificar el código',
      '¿Confirmás el inicio del trabajo sin verificar el código? Registramos tu presencia y el contrato empieza cuando la otra parte también confirme.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Iniciar sin código', style: 'destructive', onPress: () => ejecutar(() => iniciarSinCodigo(id), () => setOfrecerSinCodigo(false)) },
      ],
    );

  const aceptar = puedeAceptarElContrato(contract, isClient, isDoer);
  const esperandoALaOtra =
    String(contract?.status) === 'ready' && !aceptar && !(contract?.termsAcceptedByClient && contract?.termsAcceptedByDoer) && (isClient || isDoer);
  const emparejar = mostrarEmparejamiento(contract);

  if (!aceptar && !esperandoALaOtra && !emparejar) return null;

  const fila = (nombre: string, listo: boolean) => (
    <View style={styles.parte}>
      {listo ? <CheckCircle size={18} color={colors.success[600]} /> : <AlertCircle size={18} color={themeColors.text.muted} />}
      <Text style={[styles.parteTexto, { color: themeColors.text.primary }]}>
        {nombre}: {listo ? 'confirmado' : 'pendiente'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      {(aceptar || esperandoALaOtra) && (
        <>
          <View style={styles.titulo}>
            <FileCheck size={18} color={colors.primary[600]} />
            <Text style={[styles.tituloTexto, { color: themeColors.text.primary }]}>Aceptar el contrato</Text>
          </View>
          <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
            Administración ya revisó el contrato. Para avanzar, las dos partes tienen que aceptarlo.
          </Text>
          {fila('Cliente', Boolean(contract?.termsAcceptedByClient))}
          {fila('Trabajador', Boolean(contract?.termsAcceptedByDoer))}
          {aceptar ? (
            <TouchableOpacity
              style={[styles.boton, trabajando && { opacity: 0.6 }]}
              onPress={() => ejecutar(() => aceptarElContrato(id))}
              disabled={trabajando}
            >
              {trabajando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Aceptar el contrato</Text>}
            </TouchableOpacity>
          ) : (
            <Text style={[styles.parrafo, { color: themeColors.text.muted }]}>Ya aceptaste. Esperando a la otra parte.</Text>
          )}
        </>
      )}

      {emparejar && (
        <>
          <View style={styles.titulo}>
            <Key size={18} color={colors.primary[600]} />
            <Text style={[styles.tituloTexto, { color: themeColors.text.primary }]}>Código de emparejamiento</Text>
          </View>
          <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
            Las dos partes confirman el código para empezar el trabajo.
          </Text>

          {!contract.pairingCode && puedeGenerarElCodigo(contract) && (
            <>
              <Text style={[styles.parrafo, { color: themeColors.text.secondary }]}>
                El contrato empieza en menos de 24 horas. Generá el código para confirmar el inicio.
              </Text>
              <TouchableOpacity
                style={[styles.boton, trabajando && { opacity: 0.6 }]}
                onPress={() => ejecutar(() => generarElCodigo(id))}
                disabled={trabajando}
              >
                {trabajando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Generar el código</Text>}
              </TouchableOpacity>
            </>
          )}

          {contract.pairingCode && (
            <>
              <View style={[styles.codigoCaja, { backgroundColor: themeColors.slate[100] }]}>
                <Text style={[styles.codigo, { color: colors.primary[600] }]} selectable>
                  {String(contract.pairingCode)}
                </Text>
                <TouchableOpacity onPress={copiar} accessibilityLabel="Copiar el código" style={styles.copiar}>
                  <Copy size={20} color={colors.primary[600]} />
                </TouchableOpacity>
              </View>
              {contract.pairingExpiry && (
                <Text style={[styles.chico, { color: themeColors.text.muted }]}>
                  Vence: {new Date(contract.pairingExpiry).toLocaleString('es-AR')}
                </Text>
              )}
              {fila('Cliente', Boolean(contract.clientConfirmedPairing))}
              {fila('Trabajador', Boolean(contract.doerConfirmedPairing))}

              {puedeConfirmarMiParte(contract, isClient, isDoer) && (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={[styles.parrafo, { color: themeColors.text.primary }]}>Escribí el código para confirmar:</Text>
                  <View style={styles.entrada}>
                    <TextInput
                      value={codigo}
                      onChangeText={(t) => { setCodigo(normalizarCodigo(t)); setOfrecerSinCodigo(false); }}
                      placeholder="Código"
                      placeholderTextColor={themeColors.text.muted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={largoEsperadoDelCodigo(contract.pairingCode)}
                      style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
                    />
                    <TouchableOpacity
                      style={[styles.botonChico, (!codigoCompleto(codigo, contract.pairingCode) || trabajando) && { opacity: 0.5 }]}
                      disabled={!codigoCompleto(codigo, contract.pairingCode) || trabajando}
                      onPress={() =>
                        ejecutar(() => confirmarElCodigo(id, codigo), (r) => {
                          if (r.ok) setCodigo('');
                          else setOfrecerSinCodigo(sugerirInicioSinCodigo(r.mensaje));
                        })
                      }
                    >
                      {trabajando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.botonTexto}>Confirmar</Text>}
                    </TouchableOpacity>
                  </View>
                  {ofrecerSinCodigo && (
                    <View style={[styles.aviso, { borderColor: colors.warning[400], backgroundColor: colors.warning[50] }]}>
                      <Text style={{ color: colors.slate[800], fontSize: fontSize.sm }}>
                        ¿No podés ingresar el código? Podés iniciar el trabajo de todas formas si las dos partes están presentes.
                      </Text>
                      <TouchableOpacity style={styles.botonAviso} onPress={confirmarSinCodigo} disabled={trabajando}>
                        <Text style={styles.botonTexto}>Iniciar sin código</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {contract.clientConfirmedPairing && contract.doerConfirmedPairing && (
                <View style={[styles.aviso, { borderColor: colors.success[400], backgroundColor: colors.success[50] }]}>
                  <Text style={{ color: colors.success[700], fontSize: fontSize.sm }}>
                    Las dos partes confirmaron: el contrato empezó. Ya pueden trabajar.
                  </Text>
                </View>
              )}
            </>
          )}
        </>
      )}

      {mensaje && (
        <Text style={{ marginTop: spacing.sm, fontSize: fontSize.sm, color: mensaje.error ? colors.danger[600] : colors.success[700] }}>
          {mensaje.texto}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.sm },
  tituloTexto: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  parrafo: { fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs },
  chico: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xs },
  parte: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  parteTexto: { fontSize: fontSize.sm },
  boton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    height: 46,
    marginTop: spacing.md,
  },
  botonChico: { backgroundColor: colors.primary[600], borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  botonAviso: { backgroundColor: colors.warning[600], borderRadius: borderRadius.md, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  botonTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  codigoCaja: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.sm },
  codigo: { fontSize: 32, fontWeight: fontWeight.bold, letterSpacing: 6 },
  copiar: { marginLeft: spacing.md, padding: spacing.xs },
  entrada: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.lg, letterSpacing: 4 },
  aviso: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.sm, marginTop: spacing.md },
});
