import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { CheckCircle2, Circle, AlertTriangle, CalendarDays } from 'lucide-react-native';
import { get } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface Detalle {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: 'pending' | 'in_progress' | 'completed';
  reclamado: boolean;
  reclamadoPor: { id: string; name: string } | null;
  notaDelReclamo: string | null;
  fotos: string[];
}

interface Dia {
  fecha: string;
  estado: 'sin_marcar' | 'pendiente' | 'confirmado';
  adjuntos: Array<{ url: string; nombre: string; tipo: string; subidoPor: 'client' | 'worker' }>;
}

const API_BASE = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/api\/?$/, '');
const abs = (u: string) => (u.startsWith('http') ? u : `${API_BASE}${u.startsWith('/') ? '' : '/'}${u}`);

/**
 * Espejo del componente web: las pruebas del contrato por detalle obligatorio
 * (tarea + fotos + si fue reclamada) y por dia (control diario).
 */
export default function PruebasPorDetalle({ disputeId, textColor, mutedColor, cardColor, borderColor }: {
  disputeId: string;
  textColor: string;
  mutedColor: string;
  cardColor: string;
  borderColor: string;
}) {
  const [data, setData] = useState<{ detalles: Detalle[]; porDia: Dia[]; resumenDiario: { confirmados: number; total: number } } | null>(null);

  useEffect(() => {
    get<any>(`/disputes/${disputeId}/pruebas`).then((r) => { if (r.success) setData((r as any).data); }).catch(() => {});
  }, [disputeId]);

  if (!data || (data.detalles.length === 0 && data.porDia.length === 0)) return null;

  return (
    <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
      <Text style={[styles.titulo, { color: textColor }]}>Pruebas por detalle del trabajo</Text>
      <Text style={[styles.ayuda, { color: mutedColor }]}>Cada detalle obligatorio con sus fotos y si fue reclamado. Solo estos detalles pueden fundar la disputa (T&C 10.5).</Text>

      {data.detalles.map((d) => (
        <View key={d.id} style={[styles.detalle, { borderColor: d.reclamado ? colors.danger[400] : borderColor, backgroundColor: d.reclamado ? colors.danger[50] : 'transparent' }]}>
          <View style={styles.fila}>
            {d.reclamado ? <AlertTriangle size={16} color={colors.danger[600]} /> : d.estado === 'completed' ? <CheckCircle2 size={16} color={colors.success[600]} /> : <Circle size={16} color={colors.slate[400]} />}
            <Text style={[styles.detalleTitulo, { color: textColor }]}>{d.titulo}</Text>
          </View>
          {d.descripcion ? <Text style={[styles.texto, { color: mutedColor }]}>{d.descripcion}</Text> : null}
          <Text style={[styles.meta, { color: d.reclamado ? colors.danger[700] : mutedColor }]}>
            {d.estado === 'completed' ? 'Completado' : d.estado === 'in_progress' ? 'En curso' : 'Pendiente'}
            {d.reclamado ? ` · Reclamado${d.reclamadoPor ? ` por ${d.reclamadoPor.name}` : ''}` : ''}
          </Text>
          {d.notaDelReclamo ? <Text style={[styles.nota, { color: textColor }]}>"{d.notaDelReclamo}"</Text> : null}
          {d.fotos.length > 0 ? (
            <View style={styles.grilla}>
              {d.fotos.map((f, i) => (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(abs(f)).catch(() => {})}>
                  <Image source={{ uri: abs(f) }} style={styles.foto} accessibilityLabel={`${d.titulo} · foto ${i + 1}`} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[styles.meta, { color: colors.slate[400] }]}>Sin fotos de este detalle.</Text>
          )}
        </View>
      ))}

      {data.porDia.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          <View style={styles.fila}>
            <CalendarDays size={16} color={textColor} />
            <Text style={[styles.subtitulo, { color: textColor }]}>Control diario</Text>
            <Text style={[styles.meta, { color: mutedColor }]}>({data.resumenDiario.confirmados} de {data.resumenDiario.total} confirmados)</Text>
          </View>
          {data.porDia.map((dia) => (
            <View key={dia.fecha} style={[styles.detalle, { borderColor }]}>
              <View style={[styles.fila, { justifyContent: 'space-between' }]}>
                <Text style={[styles.detalleTitulo, { color: textColor }]}>{new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                <Text style={[styles.meta, { color: dia.estado === 'confirmado' ? colors.success[700] : dia.estado === 'pendiente' ? colors.warning[600] : colors.slate[400] }]}>
                  {dia.estado === 'confirmado' ? 'confirmado por el cliente' : dia.estado === 'pendiente' ? 'solo el trabajador' : 'sin marcar'}
                </Text>
              </View>
              {dia.adjuntos.length > 0 && (
                <View style={styles.grilla}>
                  {dia.adjuntos.map((a, i) => (
                    <TouchableOpacity key={i} onPress={() => Linking.openURL(abs(a.url)).catch(() => {})}>
                      {a.tipo.startsWith('image/') ? (
                        <Image source={{ uri: abs(a.url) }} style={styles.foto} accessibilityLabel={a.nombre} />
                      ) : (
                        <View style={[styles.foto, styles.archivo]}><Text style={styles.archivoTexto} numberOfLines={3}>{a.nombre}</Text></View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
  subtitulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  ayuda: { fontSize: fontSize.xs, marginTop: 2, marginBottom: spacing.sm },
  detalle: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.sm, marginTop: spacing.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detalleTitulo: { fontWeight: fontWeight.semibold, fontSize: fontSize.sm, flex: 1 },
  texto: { fontSize: fontSize.sm, marginTop: 2 },
  meta: { fontSize: fontSize.xs, marginTop: 2 },
  nota: { fontStyle: 'italic', fontSize: fontSize.sm, marginTop: 4 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  foto: { width: 72, height: 72, borderRadius: 6, backgroundColor: colors.slate[100] },
  archivo: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  archivoTexto: { fontSize: 10, color: colors.slate[600], textAlign: 'center' },
});
