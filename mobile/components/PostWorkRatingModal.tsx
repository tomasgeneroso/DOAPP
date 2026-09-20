import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Star, ThumbsUp, ThumbsDown, Lock, ArrowLeft, CheckCircle } from 'lucide-react-native';
import { get, post } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Puntuacion post-trabajo, espejo del modal web. Dos pantallas, las dos
 * obligatorias:
 *
 *   1  estrellas generales + dimensiones (al cliente solo las que le aplican)
 *   2  ¿recomendarias DoApp? + reseña PUBLICA (obligatoria, 10+) + nota PRIVADA
 *
 * Mientras quede una sin terminar, el servidor bloquea publicar y postularse
 * (403 PENDING_POST_WORK_RATING), asi que el portero la muestra en cualquier
 * pantalla. El progreso se guarda como borrador: se retoma donde se dejo.
 *
 * Mobile no tenia este flujo: un usuario que solo usaba el celular quedaba
 * bloqueado sin forma de destrabarse.
 */

type ReviewedRole = 'doer' | 'client';
type DimKey = 'timeliness' | 'attendance' | 'communication' | 'fairPrice' | 'quality' | 'professionalism';

const DIMENSIONES: Array<{ key: DimKey; rotulo: string; ayuda: string; soloTrabajador?: boolean }> = [
  { key: 'timeliness', rotulo: 'Puntualidad', ayuda: '¿Llegó a la hora acordada?' },
  { key: 'attendance', rotulo: 'Presencialidad', ayuda: '¿Se presentó? ¿No te dejó plantado?', soloTrabajador: true },
  { key: 'communication', rotulo: 'Como persona', ayuda: 'Trato, actitud y respeto' },
  { key: 'fairPrice', rotulo: 'Precio justo', ayuda: '¿Se respetó lo acordado?' },
  { key: 'quality', rotulo: 'Calidad de trabajo', ayuda: '¿Quedó bien hecho?', soloTrabajador: true },
  { key: 'professionalism', rotulo: 'Profesionalidad', ayuda: 'Herramientas ordenadas, trabajo prolijo', soloTrabajador: true },
];
const ROTULOS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];

export interface PendingRating {
  contractId: string;
  reviewedName: string;
  reviewedRole: ReviewedRole;
  draft: null | {
    rating: number | null;
    recommendsApp: boolean | null;
    note: string | null;
    privateNote: string | null;
    [k: string]: any;
  };
}

function Estrellas({ valor, onChange, size = 30 }: { valor: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} accessibilityRole="button" accessibilityLabel={`${n} de 5`}>
          <Star size={size} color={n <= valor ? '#f59e0b' : colors.slate[300]} fill={n <= valor ? '#f59e0b' : 'transparent'} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PostWorkRatingModal({ pendiente, onDone }: { pendiente: PendingRating; onDone: () => void }) {
  const dims = DIMENSIONES.filter((d) => pendiente.reviewedRole === 'doer' || !d.soloTrabajador);
  const [paso, setPaso] = useState<1 | 2>(pendiente.draft?.rating ? 2 : 1);
  const [general, setGeneral] = useState(pendiente.draft?.rating || 0);
  const [valores, setValores] = useState<Record<string, number>>(() => {
    const v: Record<string, number> = {};
    for (const d of dims) v[d.key] = Number(pendiente.draft?.[d.key]) || 0;
    return v;
  });
  const [recomienda, setRecomienda] = useState<boolean | null>(pendiente.draft?.recommendsApp ?? null);
  const [nota, setNota] = useState(pendiente.draft?.note || '');
  const [privada, setPrivada] = useState(pendiente.draft?.privateNote || '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const sucio = useRef(false);

  const llenas = dims.map((d) => valores[d.key]).filter((v) => v > 0);
  const generalEfectivo = general || (llenas.length ? Math.round(llenas.reduce((a, b) => a + b, 0) / llenas.length) : 0);

  const payload = () => {
    const p: Record<string, any> = { contractId: pendiente.contractId };
    if (generalEfectivo > 0) p.rating = generalEfectivo;
    if (recomienda !== null) p.recommendsApp = recomienda;
    if (nota.trim()) p.note = nota.trim();
    if (privada.trim()) p.privateNote = privada.trim();
    for (const d of dims) if (valores[d.key] > 0) p[d.key] = valores[d.key];
    return p;
  };

  // Borrador cada 2,5 s si hubo cambios: la encuesta se retoma donde quedo.
  useEffect(() => {
    if (listo || !sucio.current) return;
    const t = setTimeout(() => {
      post('/reviews/post-work/draft', payload()).catch(() => {});
      sucio.current = false;
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [general, valores, recomienda, nota, privada, listo]);

  const marcar = () => { sucio.current = true; };

  const enviar = async () => {
    if (recomienda === null) { setError('Contanos si recomendarías DoApp'); return; }
    if (nota.trim().length < 10) { setError('Escribí una reseña pública de al menos 10 caracteres: es lo que va a leer el próximo que contrate.'); return; }
    setError(null);
    setEnviando(true);
    const res = await post<any>('/reviews/post-work', payload());
    setEnviando(false);
    if (res.success || (res as any).code === 'ALREADY_RATED') {
      setListo(true);
      setTimeout(onDone, 1200);
    } else {
      setError(res.message || 'No pudimos guardar tu puntuación');
    }
  };

  const nombre = pendiente.reviewedName || (pendiente.reviewedRole === 'client' ? 'el cliente' : 'el trabajador');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => {}}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fondo}>
        <View style={styles.tarjeta}>
          {listo ? (
            <View style={{ alignItems: 'center', padding: spacing.lg, gap: 8 }}>
              <CheckCircle size={40} color={colors.success[600]} />
              <Text style={styles.titulo}>¡Gracias!</Text>
              <Text style={styles.ayuda}>Tu reseña ya está publicada.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
              <View style={styles.pasos}>
                <View style={[styles.punto, styles.puntoActivo]} />
                <View style={[styles.punto, paso === 2 && styles.puntoActivo]} />
              </View>

              {paso === 1 ? (
                <>
                  <Text style={styles.titulo}>{pendiente.reviewedRole === 'client' ? `Puntuá a ${nombre} como cliente` : `Puntuá el trabajo de ${nombre}`}</Text>
                  <Text style={styles.ayuda}>Es obligatorio para seguir usando DoApp. Te lleva un minuto.</Text>

                  <View style={styles.bloque}>
                    <Text style={styles.rotulo}>Puntuación general</Text>
                    <Estrellas valor={generalEfectivo} onChange={(v) => { marcar(); setGeneral(v); }} size={34} />
                    {generalEfectivo > 0 && <Text style={styles.ayuda}>{ROTULOS[generalEfectivo]}</Text>}
                  </View>

                  {dims.map((d) => (
                    <View key={d.key} style={styles.fila}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rotulo}>{d.rotulo}</Text>
                        <Text style={styles.ayuda}>{d.ayuda}</Text>
                      </View>
                      <Estrellas valor={valores[d.key]} onChange={(v) => { marcar(); setValores((p) => ({ ...p, [d.key]: v })); }} size={22} />
                    </View>
                  ))}

                  {error && <Text style={styles.error}>{error}</Text>}
                  <TouchableOpacity
                    style={[styles.primario, generalEfectivo === 0 && { opacity: 0.5 }]}
                    disabled={generalEfectivo === 0}
                    onPress={() => { setError(null); setPaso(2); post('/reviews/post-work/draft', payload()).catch(() => {}); }}
                  >
                    <Text style={styles.primarioTexto}>Continuar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.titulo}>Una última cosa</Text>

                  <View style={styles.bloque}>
                    <Text style={styles.rotulo}>¿Recomendarías DoApp?</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[styles.opcion, recomienda === true && styles.opcionSi]} onPress={() => { marcar(); setRecomienda(true); }}>
                        <ThumbsUp size={18} color={recomienda === true ? '#fff' : colors.slate[700]} />
                        <Text style={[styles.opcionTexto, recomienda === true && { color: '#fff' }]}>Sí</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.opcion, recomienda === false && styles.opcionNo]} onPress={() => { marcar(); setRecomienda(false); }}>
                        <ThumbsDown size={18} color={recomienda === false ? '#fff' : colors.slate[700]} />
                        <Text style={[styles.opcionTexto, recomienda === false && { color: '#fff' }]}>No</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.bloque}>
                    <Text style={styles.rotulo}>Reseña pública *</Text>
                    <Text style={styles.ayuda}>Se ve en el perfil de {nombre}. Es lo que va a leer el próximo que contrate: qué salió bien, qué no.</Text>
                    <TextInput
                      style={styles.input}
                      multiline
                      value={nota}
                      onChangeText={(t) => { marcar(); setNota(t); }}
                      maxLength={1000}
                      placeholder="Contá cómo fue el trabajo (mínimo 10 caracteres)"
                      placeholderTextColor={colors.slate[400]}
                    />
                    <Text style={styles.contador}>{nota.length}/1000</Text>
                  </View>

                  <View style={styles.bloque}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Lock size={14} color={colors.slate[500]} />
                      <Text style={styles.rotulo}>Nota privada (opcional)</Text>
                    </View>
                    <Text style={styles.ayuda}>La lee solo {nombre} y el equipo de DOAPP. No aparece en el perfil ni cambia la puntuación.</Text>
                    <TextInput
                      style={[styles.input, { minHeight: 60 }]}
                      multiline
                      value={privada}
                      onChangeText={(t) => { marcar(); setPrivada(t); }}
                      maxLength={1000}
                      placeholder="Algo que quieras decirle solo a esta persona"
                      placeholderTextColor={colors.slate[400]}
                    />
                  </View>

                  {error && <Text style={styles.error}>{error}</Text>}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.secundario} onPress={() => { setError(null); setPaso(1); }} disabled={enviando}>
                      <ArrowLeft size={16} color={colors.slate[600]} />
                      <Text style={styles.secundarioTexto}>Volver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primario, { flex: 1 }, (enviando || recomienda === null || nota.trim().length < 10) && { opacity: 0.5 }]}
                      disabled={enviando || recomienda === null || nota.trim().length < 10}
                      onPress={enviar}
                    >
                      {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.primarioTexto}>Enviar</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Portero: consulta las puntuaciones pendientes y muestra la primera. Se
 * monta una vez en el layout y consulta al entrar, al volver a primer plano y
 * cuando una pantalla avisa que termino un trabajo.
 */
export function PostWorkRatingGate({ isAuthenticated, refreshKey }: { isAuthenticated: boolean; refreshKey?: any }) {
  const [pendientes, setPendientes] = useState<PendingRating[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { setPendientes([]); return; }
    let vivo = true;
    get<any>('/reviews/post-work/pending')
      .then((r) => {
        if (!vivo || !r.success) return;
        const lista = ((r as any).data || []) as any[];
        setPendientes(lista.map((i) => ({
          contractId: i.contractId,
          reviewedName: i.reviewedName,
          reviewedRole: i.reviewedRole === 'client' ? 'client' : 'doer',
          draft: i.draft || null,
        })));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [isAuthenticated, refreshKey]);

  const actual = pendientes[0];
  if (!actual) return null;
  return <PostWorkRatingModal key={actual.contractId} pendiente={actual} onDone={() => setPendientes((p) => p.slice(1))} />;
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  tarjeta: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  pasos: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  punto: { width: 28, height: 4, borderRadius: 2, backgroundColor: colors.slate[200] },
  puntoActivo: { backgroundColor: colors.primary[500] },
  titulo: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.slate[900] },
  ayuda: { fontSize: fontSize.xs, color: colors.slate[500], marginTop: 2 },
  bloque: { gap: 6 },
  rotulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.slate[800] },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  input: { borderWidth: 1, borderColor: colors.slate[300], borderRadius: borderRadius.md, padding: 10, minHeight: 80, color: colors.slate[900], textAlignVertical: 'top' },
  contador: { fontSize: 11, color: colors.slate[400], textAlign: 'right' },
  opcion: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.slate[300], borderRadius: borderRadius.md, paddingVertical: 10 },
  opcionSi: { backgroundColor: colors.success[600], borderColor: colors.success[600] },
  opcionNo: { backgroundColor: colors.danger[600], borderColor: colors.danger[600] },
  opcionTexto: { fontWeight: fontWeight.semibold, color: colors.slate[700] },
  primario: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primarioTexto: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.base },
  secundario: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.slate[300] },
  secundarioTexto: { color: colors.slate[600], fontWeight: fontWeight.semibold },
  error: { color: colors.danger[600], fontSize: fontSize.sm },
});
