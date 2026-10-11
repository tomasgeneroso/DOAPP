import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Switch, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../constants/theme';
import {
  admiteDevolucionManual,
  interpretarResolucion,
  requiereMonto,
  resolverDisputa,
  TIPOS_DE_RESOLUCION,
  traerDisputa,
  validarResolucion,
  type TipoDeResolucion,
} from '../../../services/admin';

/**
 * Una disputa, para que un administrador la resuelva desde el celular.
 *
 * Mueve plata: libera el dinero retenido, lo devuelve entero o en parte. El servidor revisa el rol, el estado de la
 * disputa y que el plazo de las partes ya haya vencido; la devolución «por fuera» (un pago que no es de Mercado Pago)
 * necesita además un permiso que concede el owner desde Roles. Acá se arma el pedido, se pide una confirmación y se
 * cuenta lo que respondió el servidor.
 */
export default function AdminDisputa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [disputa, setDisputa] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tipo, setTipo] = useState<TipoDeResolucion | ''>('');
  const [explicacion, setExplicacion] = useState('');
  const [monto, setMonto] = useState('');
  const [manual, setManual] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const r: any = await traerDisputa(String(id));
      if (r?.success && r.data) {
        setDisputa(r.data);
        setError('');
      } else {
        setError(r?.message || 'No se pudo cargar la disputa.');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la disputa.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const resuelta = !!disputa && (String(disputa.status).startsWith('resolved') || disputa.status === 'cancelled');
  const pesos = (n: unknown) => `$${Number(n || 0).toLocaleString('es-AR')}`;

  const resolver = () => {
    setMensaje('');
    const v = validarResolucion({ tipo, explicacion, monto, devolucionManual: manual });
    if (!v.ok) {
      setMensaje(v.error);
      return;
    }
    const etiqueta = TIPOS_DE_RESOLUCION.find((t) => t.valor === tipo)?.etiqueta || '';
    Alert.alert('Resolver la disputa', `${etiqueta}\n\nEsto mueve dinero y no se puede deshacer desde la app.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Resolver',
        style: 'destructive',
        onPress: async () => {
          setResolviendo(true);
          try {
            const r = interpretarResolucion(await resolverDisputa(String(id), v.cuerpo));
            if (r.ok) {
              Alert.alert('Disputa resuelta', r.mensaje, [{ text: 'OK', onPress: () => router.back() }]);
              await cargar();
            } else {
              setMensaje(r.mensaje);
            }
          } catch (e: any) {
            setMensaje(e?.message || 'No se pudo resolver la disputa.');
          } finally {
            setResolviendo(false);
          }
        },
      },
    ]);
  };

  if (cargando) return <ActivityIndicator style={{ marginTop: spacing['3xl'] }} color={colors.primary[600]} />;
  if (!disputa) {
    return <Text style={{ color: colors.danger[600], padding: spacing.lg }}>{error || 'No se encontró la disputa.'}</Text>;
  }

  return (
    <ScrollView style={{ backgroundColor: themeColors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['4xl'] }} keyboardShouldPersistTaps="handled">
      <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Text style={[styles.titulo, { color: themeColors.text.primary }]}>{disputa.reason || 'Disputa'}</Text>
        <Text style={[styles.dato, { color: themeColors.text.secondary }]}>
          {disputa.initiator?.name || 'Quien reclama'} vs {disputa.defendant?.name || 'la otra parte'}
        </Text>
        <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Estado: {disputa.status} · Prioridad: {disputa.priority || '—'}</Text>
        {!!disputa.contract?.price && <Text style={[styles.dato, { color: themeColors.text.secondary }]}>Contrato: {pesos(disputa.contract.price)}</Text>}
        {!!disputa.payment && (
          <Text style={[styles.dato, { color: themeColors.text.secondary }]}>
            Pago: {pesos(disputa.payment.amount)} ({disputa.payment.status}){disputa.payment.mercadopagoPaymentId ? ' · Mercado Pago' : ' · no es de Mercado Pago'}
          </Text>
        )}
        {!!disputa.detailedDescription && <Text style={[styles.texto, { color: themeColors.text.primary }]}>{disputa.detailedDescription}</Text>}
      </View>

      {resuelta ? (
        <View style={[styles.caja, { backgroundColor: colors.success[50], borderColor: colors.success[400] }]}>
          <Text style={{ color: colors.success[700], fontWeight: fontWeight.semibold }}>Resuelta</Text>
          {!!disputa.resolution && <Text style={{ color: colors.success[700], marginTop: spacing.xs }}>{disputa.resolution}</Text>}
        </View>
      ) : (
        <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Resolver</Text>

          {TIPOS_DE_RESOLUCION.map((t) => {
            const elegido = tipo === t.valor;
            return (
              <TouchableOpacity
                key={t.valor}
                onPress={() => { setTipo(t.valor); setMensaje(''); }}
                style={[styles.opcion, { borderColor: elegido ? colors.primary[600] : themeColors.border, backgroundColor: elegido ? colors.primary[50] : 'transparent' }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: elegido }}
              >
                <Text style={{ color: themeColors.text.primary, fontWeight: fontWeight.medium }}>{t.etiqueta}</Text>
                <Text style={{ color: themeColors.text.secondary, fontSize: fontSize.xs, marginTop: 2 }}>{t.ayuda}</Text>
              </TouchableOpacity>
            );
          })}

          {tipo !== '' && requiereMonto(tipo) && (
            <>
              <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>Monto a devolver al cliente ($)</Text>
              <TextInput
                value={monto}
                onChangeText={setMonto}
                keyboardType="numeric"
                placeholder="Ej.: 5.000"
                placeholderTextColor={themeColors.text.muted}
                style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
              />
            </>
          )}

          {tipo !== '' && admiteDevolucionManual(tipo) && (
            <View style={styles.filaSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: themeColors.text.primary, fontWeight: fontWeight.medium }}>La devolución se hizo por fuera</Text>
                <Text style={{ color: themeColors.text.secondary, fontSize: fontSize.xs }}>
                  Sólo para pagos que no son de Mercado Pago. Exige un permiso especial.
                </Text>
              </View>
              <Switch value={manual} onValueChange={setManual} />
            </View>
          )}

          <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>Explicación (la leen las dos partes)</Text>
          <TextInput
            value={explicacion}
            onChangeText={setExplicacion}
            multiline
            placeholder="Contá cómo se resuelve y por qué"
            placeholderTextColor={themeColors.text.muted}
            style={[styles.input, styles.inputGrande, { color: themeColors.text.primary, borderColor: themeColors.border }]}
          />

          {!!mensaje && <Text style={{ color: colors.danger[600], marginTop: spacing.sm, fontSize: fontSize.sm }}>{mensaje}</Text>}

          <TouchableOpacity style={[styles.boton, resolviendo && { opacity: 0.6 }]} onPress={resolver} disabled={resolviendo}>
            {resolviendo ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Resolver la disputa</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  dato: { fontSize: fontSize.sm, marginTop: 2 },
  texto: { fontSize: fontSize.sm, marginTop: spacing.md, lineHeight: 20 },
  opcion: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.sm },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.base },
  inputGrande: { height: 100, paddingTop: spacing.sm, textAlignVertical: 'top' },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  boton: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
