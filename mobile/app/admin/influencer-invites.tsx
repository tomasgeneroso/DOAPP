import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Ban, Plus, Send } from 'lucide-react-native';
import Pantalla from '../../components/Pantalla';
import PedirMotivo from '../../components/PedirMotivo';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import {
  ETIQUETAS_DE_ESTADO,
  MOTIVO_MINIMO,
  darDeBaja,
  emitirLote,
  enlacesDisponibles,
  interpretarLotes,
  listarLotes,
  type InvitacionDelLote,
  type LoteDeInvitaciones,
} from '../../services/invitaciones';

/**
 * Invitaciones de creadores de contenido (solo el owner). Cada creador recibe un lote (5 por defecto): cinco enlaces de un
 * solo uso; quien canjea uno no paga comisión como Cliente durante el plazo de la invitación (Términos 7.11).
 */
export default function AdminInvitacionesDeCreadores() {
  const { colors: themeColors } = useTheme();
  const [lotes, setLotes] = useState<LoteDeInvitaciones[]>([]);
  const [porCreador, setPorCreador] = useState(5);
  const [dias, setDias] = useState(365);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);
  const [dandoDeBaja, setDandoDeBaja] = useState<InvitacionDelLote | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = interpretarLotes(await listarLotes());
      if (r) {
        setLotes(r.lotes);
        setPorCreador(r.porCreador);
        setDias(r.dias);
        setError('');
      } else setError('No se pudieron cargar las invitaciones (solo las ve el owner).');
    } catch {
      setError('No se pudieron cargar las invitaciones.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const emitir = async () => {
    if (!nombre.trim()) return;
    setEmitiendo(true);
    setError('');
    try {
      const r: any = await emitirLote(nombre, usuario);
      if (r?.success) {
        setNombre('');
        setUsuario('');
        await cargar();
      } else setError(r?.message || 'No se pudo emitir el lote.');
    } finally {
      setEmitiendo(false);
    }
  };

  const copiar = async (texto: string, aviso: string) => {
    await Clipboard.setStringAsync(texto);
    Alert.alert('Copiado', aviso);
  };

  const compartir = (l: LoteDeInvitaciones) => {
    const enlaces = enlacesDisponibles(l);
    if (!enlaces) {
      Alert.alert('Sin enlaces', 'Este creador no tiene invitaciones disponibles.');
      return;
    }
    Share.share({ message: `Hola ${l.influencer}! Tus invitaciones de DOAPP (cada enlace es de un solo uso y da ${dias} días sin comisión a quien lo active):\n\n${enlaces}` });
  };

  const confirmarBaja = async (motivo: string) => {
    if (!dandoDeBaja) return;
    setTrabajando(true);
    try {
      const r: any = await darDeBaja(dandoDeBaja.id, motivo);
      setDandoDeBaja(null);
      Alert.alert(r?.success ? 'Listo' : 'No se pudo', r?.message || (r?.success ? 'Invitación dada de baja.' : 'Probá de nuevo.'));
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—');

  return (
    <Pantalla titulo="Invitaciones de creadores" cargando={cargando} error={error} onRefrescar={() => { setRefrescando(true); cargar(); }} refrescando={refrescando} sinBarra>
      <Text style={[styles.texto, { color: themeColors.text.secondary }]}>
        Cada creador recibe {porCreador} enlaces de un solo uso. Quien canjea uno no paga comisión como Cliente durante {dias} días desde el canje (Términos 7.11). No incluye el costo de procesamiento ni los impuestos.
      </Text>

      <View style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>Nombre del creador *</Text>
        <TextInput value={nombre} onChangeText={setNombre} maxLength={120} placeholder="Ej.: Ana Pérez" placeholderTextColor={themeColors.text.muted}
          style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]} />
        <Text style={[styles.etiqueta, { color: themeColors.text.primary, marginTop: spacing.sm }]}>Usuario en la red (@…)</Text>
        <TextInput value={usuario} onChangeText={setUsuario} maxLength={160} autoCapitalize="none" placeholder="@anaperez" placeholderTextColor={themeColors.text.muted}
          style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]} />
        <TouchableOpacity style={[styles.boton, (!nombre.trim() || emitiendo) && { opacity: 0.5 }]} onPress={emitir} disabled={!nombre.trim() || emitiendo}>
          {emitiendo ? <ActivityIndicator color="#fff" /> : (<><Plus size={18} color="#fff" /><Text style={styles.botonTexto}>Emitir {porCreador} invitaciones</Text></>)}
        </TouchableOpacity>
      </View>

      {lotes.length === 0 && !cargando && <Text style={{ color: themeColors.text.muted, textAlign: 'center' }}>Todavía no emitiste invitaciones.</Text>}

      {lotes.map((l) => (
        <View key={l.batchId} style={[styles.caja, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.nombre, { color: themeColors.text.primary }]}>{l.influencer}{l.handle ? ` · ${l.handle}` : ''}</Text>
          <Text style={[styles.chico, { color: themeColors.text.muted }]}>Emitidas el {fecha(l.creadoEl)} · {l.canjeadas} de {l.total} canjeadas</Text>
          <View style={styles.fila}>
            <TouchableOpacity style={[styles.botonChico, { borderColor: themeColors.border }]} onPress={() => copiar(enlacesDisponibles(l), 'Se copiaron los enlaces disponibles.')}>
              <Copy size={16} color={colors.primary[600]} /><Text style={styles.botonChicoTexto}>Copiar enlaces</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonChico, { borderColor: themeColors.border }]} onPress={() => compartir(l)}>
              <Send size={16} color={colors.primary[600]} /><Text style={styles.botonChicoTexto}>Compartir</Text>
            </TouchableOpacity>
          </View>
          {l.invitaciones.map((i) => (
            <View key={i.id} style={[styles.invitacion, { borderTopColor: themeColors.border }]}>
              <Text style={[styles.estado, { color: i.estado === 'valida' ? colors.success[700] : themeColors.text.secondary }]}>{ETIQUETAS_DE_ESTADO[i.estado]}</Text>
              <Text style={[styles.enlace, { color: themeColors.text.primary }]} selectable>{i.enlace}</Text>
              {i.estado === 'canjeada' && !!i.canjeadaPor && (
                <Text style={[styles.chico, { color: themeColors.text.muted }]}>
                  {i.canjeadaPor.name} ({i.canjeadaPor.email}) · {fecha(i.canjeadaEl)} · sin comisión hasta el {fecha(i.beneficioHasta)}
                </Text>
              )}
              {i.estado === 'valida' && (
                <View style={styles.fila}>
                  <TouchableOpacity onPress={() => copiar(i.enlace, 'Enlace copiado.')} style={styles.enlaceAccion}>
                    <Copy size={16} color={colors.primary[600]} /><Text style={styles.botonChicoTexto}>Copiar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDandoDeBaja(i)} style={styles.enlaceAccion}>
                    <Ban size={16} color={colors.danger[600]} /><Text style={{ color: colors.danger[600], fontSize: fontSize.sm }}>Dar de baja</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      <PedirMotivo
        visible={!!dandoDeBaja}
        titulo="Dar de baja la invitación"
        ayuda="Queda anotado en la auditoría. Una invitación ya canjeada no se puede dar de baja."
        minimo={MOTIVO_MINIMO}
        etiquetaConfirmar="Dar de baja"
        trabajando={trabajando}
        onCancelar={() => setDandoDeBaja(null)}
        onConfirmar={confirmarBaja}
      />
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  texto: { fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.lg },
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 44, fontSize: fontSize.base, backgroundColor: '#fff' },
  boton: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md },
  botonTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  nombre: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  chico: { fontSize: fontSize.xs, marginTop: 2 },
  fila: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  botonChico: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  botonChicoTexto: { color: colors.primary[700], fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  invitacion: { borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.sm },
  estado: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  enlace: { fontSize: fontSize.sm, marginTop: 2 },
  enlaceAccion: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
