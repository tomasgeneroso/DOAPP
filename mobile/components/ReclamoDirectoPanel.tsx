import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Clock, Handshake, ShieldAlert, Undo2, Check, X } from 'lucide-react-native';
import { post } from '../services/api';
import { estadoDelReclamo, TIPOS_DE_ACUERDO } from '../../shared/disputes/reclamo';
import { POLITICAS } from '../../shared/constants/policies';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

type TipoAcuerdo = keyof typeof TIPOS_DE_ACUERDO;

interface Propuesta {
  tipo: TipoAcuerdo;
  monto?: number;
  nota: string;
  propuestoPor: string;
  propuestaEl: string;
}

interface DisputaMinima {
  id: string;
  status: string;
  initiatedBy: string;
  against: string;
  createdAt: string;
  negotiationDeadline?: string | null;
  messages?: Array<{ from: string | { id?: string; _id?: string }; isAdmin?: boolean; createdAt: string }>;
  agreementProposal?: Propuesta | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  contract?: { price?: number; allocatedAmount?: number } | null;
}

const $ = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

/**
 * Espejo del panel web: el reloj de 72 h, la propuesta vigente y las acciones.
 * Los permisos los calcula la misma funcion compartida que usa el servidor.
 */
export default function ReclamoDirectoPanel({
  dispute,
  userId,
  onChanged,
}: {
  dispute: DisputaMinima;
  userId: string;
  onChanged: (d: any) => void;
}) {
  const [ahora, setAhora] = useState(() => new Date());
  const [enviando, setEnviando] = useState<string | null>(null);
  const [abrir, setAbrir] = useState(false);
  const [tipo, setTipo] = useState<TipoAcuerdo>('reembolso_parcial');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const estado = useMemo(() => {
    const mensajes = (dispute.messages || []).map((m) => ({
      from: typeof m.from === 'string' ? m.from : String(m.from?.id || m.from?._id || ''),
      isAdmin: m.isAdmin,
      createdAt: m.createdAt,
    }));
    return estadoDelReclamo({ ...dispute, messages: mensajes }, userId, ahora);
  }, [dispute, userId, ahora]);

  const propuesta = dispute.agreementProposal;
  const precio = Number(dispute.contract?.allocatedAmount ?? dispute.contract?.price) || 0;
  const escalada = dispute.status !== 'negotiation' && !!dispute.escalatedAt;

  const llamar = async (ruta: string, body: Record<string, unknown> = {}, etiqueta = ruta) => {
    setEnviando(etiqueta);
    const res = await post<any>(`/disputes/${dispute.id}${ruta}`, body);
    setEnviando(null);
    if (res.success) {
      onChanged((res as any).data);
      setAbrir(false);
      setMonto('');
      setNota('');
    } else {
      Alert.alert('No se pudo', res.message || 'Intentá de nuevo');
    }
  };

  const confirmar = (titulo: string, texto: string, ok: () => void) =>
    Alert.alert(titulo, texto, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí', style: 'destructive', onPress: ok }]);

  // La paleta de mobile no tiene todos los tonos; se eligen a mano por nivel.
  const TONOS = {
    peligro: { borde: colors.danger[400], fondo: colors.danger[50], texto: colors.danger[700] },
    aviso: { borde: colors.warning[400], fondo: colors.warning[50], texto: colors.warning[600] },
    normal: { borde: colors.primary[300], fondo: colors.primary[50], texto: colors.primary[800] },
  };

  if (escalada) {
    const porque =
      dispute.escalationReason === 'plazo_vencido'
        ? `Pasaron las ${POLITICAS.RECLAMO_DIRECTO_HORAS} horas sin acuerdo.`
        : dispute.escalationReason === 'intervencion_admin'
          ? 'Un administrador decidió intervenir antes del plazo.'
          : 'Una de las partes pidió que intervenga un administrador.';
    const t = TONOS.aviso;
    return (
      <View style={[styles.caja, { borderColor: t.borde, backgroundColor: t.fondo }]}>
        <View style={styles.fila}>
          <ShieldAlert size={18} color={t.texto} />
          <Text style={[styles.titulo, { color: t.texto }]}>Interviene un administrador</Text>
        </View>
        <Text style={[styles.texto, { color: t.texto }]}>
          {porque} Va a revisar el reclamo con lo que hay acá y decidir. Podés seguir escribiendo y adjuntando pruebas. El equipo se propone resolver en{' '}
          {POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS} días.
        </Text>
      </View>
    );
  }

  if (!estado.enReclamoDirecto) return null;

  const tono = estado.horasRestantes <= 6 ? TONOS.peligro : estado.horasRestantes <= 24 ? TONOS.aviso : TONOS.normal;

  return (
    <View style={[styles.caja, { borderColor: tono.borde, backgroundColor: tono.fondo }]}>
      <View style={[styles.fila, { justifyContent: 'space-between' }]}>
        <View style={[styles.fila, { flex: 1 }]}>
          <Handshake size={18} color={tono.texto} />
          <Text style={[styles.titulo, { color: tono.texto, flex: 1 }]}>Reclamo directo</Text>
        </View>
        <View style={[styles.reloj, { backgroundColor: '#ffffffb0' }]}>
          <Clock size={14} color={tono.texto} />
          <Text style={[styles.relojTexto, { color: tono.texto }]}>{estado.textoRestante}</Text>
        </View>
      </View>
      <Text style={[styles.texto, { color: tono.texto }]}>
        {estado.esReclamante ? 'La otra parte tiene' : 'Tenés'} hasta el{' '}
        {estado.plazo.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} para responder y arreglarlo entre ustedes. Si al vencer no hay acuerdo, interviene un administrador. El pago está congelado mientras tanto.
        {estado.laOtraRespondio ? ' La otra parte ya respondió.' : ''}
      </Text>

      {propuesta && (
        <View style={styles.propuesta}>
          <Text style={styles.propuestaDe}>
            Propuesta de {String(propuesta.propuestoPor) === userId ? 'tu parte' : 'la otra parte'}
          </Text>
          <Text style={styles.propuestaTitulo}>
            {TIPOS_DE_ACUERDO[propuesta.tipo].titulo}
            {propuesta.monto ? ` — ${$(propuesta.monto)}` : ''}
          </Text>
          <Text style={styles.propuestaExpl}>{TIPOS_DE_ACUERDO[propuesta.tipo].explicacion}</Text>
          {propuesta.nota ? <Text style={styles.propuestaNota}>"{propuesta.nota}"</Text> : null}
          {estado.puedeAceptarPropuesta && (
            <View style={[styles.fila, { marginTop: spacing.sm, flexWrap: 'wrap' }]}>
              <TouchableOpacity
                style={[styles.boton, { backgroundColor: colors.success[600] }]}
                disabled={!!enviando}
                onPress={() =>
                  confirmar(
                    'Aceptar el acuerdo',
                    `${TIPOS_DE_ACUERDO[propuesta.tipo].titulo}${propuesta.monto ? ` (${$(propuesta.monto)})` : ''}. Se aplica en el momento y el reclamo se cierra. No se puede deshacer.`,
                    () => llamar('/acuerdo/aceptar', {}, 'aceptar'),
                  )
                }
              >
                {enviando === 'aceptar' ? <ActivityIndicator color="#fff" /> : <Check size={16} color="#fff" />}
                <Text style={styles.botonTexto}>Aceptar y cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.boton, styles.botonBorde]} disabled={!!enviando} onPress={() => llamar('/acuerdo/rechazar', {}, 'rechazar')}>
                <X size={16} color={colors.slate[700]} />
                <Text style={[styles.botonTexto, { color: colors.slate[700] }]}>No acepto</Text>
              </TouchableOpacity>
            </View>
          )}
          {String(propuesta.propuestoPor) === userId && <Text style={styles.propuestaExpl}>Esperando a la otra parte.</Text>}
        </View>
      )}

      <View style={[styles.fila, { marginTop: spacing.sm, flexWrap: 'wrap' }]}>
        <TouchableOpacity style={[styles.boton, { backgroundColor: '#fff' }]} onPress={() => setAbrir((v) => !v)}>
          <Handshake size={16} color={colors.slate[800]} />
          <Text style={[styles.botonTexto, { color: colors.slate[800] }]}>{propuesta && String(propuesta.propuestoPor) === userId ? 'Cambiar propuesta' : 'Proponer acuerdo'}</Text>
        </TouchableOpacity>
        {estado.esReclamante && (
          <TouchableOpacity
            style={[styles.boton, styles.botonBorde]}
            disabled={!!enviando}
            onPress={() => confirmar('Retirar el reclamo', 'El contrato sigue como estaba y el pago deja de estar congelado.', () => llamar('/retirar', {}, 'retirar'))}
          >
            <Undo2 size={16} color={colors.slate[700]} />
            <Text style={[styles.botonTexto, { color: colors.slate[700] }]}>Retirar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.boton, styles.botonBorde, !estado.puedeEscalar && { opacity: 0.5 }]}
          disabled={!estado.puedeEscalar || !!enviando}
          onPress={() => confirmar('Que intervenga un administrador', 'El reclamo pasa a disputa y decide con lo que haya acá.', () => llamar('/escalar', {}, 'escalar'))}
        >
          <ShieldAlert size={16} color={colors.slate[700]} />
          <Text style={[styles.botonTexto, { color: colors.slate[700] }]}>Que intervenga un admin</Text>
        </TouchableOpacity>
      </View>
      {!estado.puedeEscalar && estado.motivoNoEscalar ? <Text style={styles.ayuda}>{estado.motivoNoEscalar}</Text> : null}

      {abrir && (
        <View style={styles.form}>
          <Text style={styles.formTitulo}>¿Qué proponés?</Text>
          {(Object.keys(TIPOS_DE_ACUERDO) as TipoAcuerdo[]).map((k) => (
            <TouchableOpacity key={k} style={[styles.opcion, tipo === k && styles.opcionActiva]} onPress={() => setTipo(k)}>
              <Text style={styles.opcionTitulo}>{TIPOS_DE_ACUERDO[k].titulo}</Text>
              <Text style={styles.opcionExpl}>{TIPOS_DE_ACUERDO[k].explicacion}</Text>
            </TouchableOpacity>
          ))}
          {tipo === 'reembolso_parcial' && (
            <>
              <Text style={styles.formTitulo}>Cuánto vuelve al cliente</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={monto}
                onChangeText={setMonto}
                placeholder={precio ? `menos de ${$(precio)}` : 'monto en pesos'}
                placeholderTextColor={colors.slate[400]}
              />
              {precio > 0 && Number(monto) > 0 && Number(monto) < precio ? (
                <Text style={styles.ayuda}>El trabajador cobraría {$(precio - Number(monto))} menos el costo de pasarela.</Text>
              ) : null}
            </>
          )}
          <Text style={styles.formTitulo}>Explicá la propuesta</Text>
          <TextInput style={[styles.input, { minHeight: 60 }]} multiline value={nota} onChangeText={setNota} maxLength={1000} placeholder="Qué pasó y por qué esto lo arregla" placeholderTextColor={colors.slate[400]} />
          <View style={[styles.fila, { marginTop: spacing.sm }]}>
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: colors.primary[600] }]}
              disabled={!!enviando}
              onPress={() => llamar('/acuerdo', { tipo, monto: tipo === 'reembolso_parcial' ? Number(monto) : undefined, nota }, 'proponer')}
            >
              {enviando === 'proponer' ? <ActivityIndicator color="#fff" /> : <Handshake size={16} color="#fff" />}
              <Text style={styles.botonTexto}>Enviar propuesta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.boton, styles.botonBorde]} onPress={() => setAbrir(false)}>
              <Text style={[styles.botonTexto, { color: colors.slate[700] }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.ayuda}>Si la otra parte acepta, se aplica en el momento y el reclamo se cierra sin administrador. La comisión de publicación no se devuelve (T&C 7.5).</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
  texto: { marginTop: spacing.xs, fontSize: fontSize.sm, lineHeight: 20 },
  reloj: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  relojTexto: { fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] },
  propuesta: { marginTop: spacing.sm, backgroundColor: '#ffffffb0', borderRadius: borderRadius.md, padding: spacing.sm },
  propuestaDe: { fontSize: 11, textTransform: 'uppercase', color: colors.slate[500] },
  propuestaTitulo: { fontWeight: fontWeight.bold, color: colors.slate[900], marginTop: 2 },
  propuestaExpl: { fontSize: fontSize.xs, color: colors.slate[600], marginTop: 2 },
  propuestaNota: { fontStyle: 'italic', color: colors.slate[800], marginTop: 4 },
  boton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: borderRadius.md, paddingVertical: 10, paddingHorizontal: 12 },
  botonBorde: { borderWidth: 1, borderColor: colors.slate[300], backgroundColor: '#ffffff80' },
  botonTexto: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  ayuda: { marginTop: 6, fontSize: 11, color: colors.slate[600] },
  form: { marginTop: spacing.sm, backgroundColor: '#ffffffc0', borderRadius: borderRadius.md, padding: spacing.sm },
  formTitulo: { fontWeight: fontWeight.semibold, color: colors.slate[800], marginTop: spacing.xs, marginBottom: 4 },
  opcion: { borderWidth: 1, borderColor: colors.slate[200], borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: 6 },
  opcionActiva: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  opcionTitulo: { fontWeight: fontWeight.semibold, color: colors.slate[900] },
  opcionExpl: { fontSize: fontSize.xs, color: colors.slate[600], marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.slate[300], borderRadius: borderRadius.md, padding: 10, color: colors.slate[900], backgroundColor: '#fff' },
});
