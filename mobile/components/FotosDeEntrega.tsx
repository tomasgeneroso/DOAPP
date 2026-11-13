import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../services/api';
import { uploadDeliveryPhotos, type FotoDeEntrega, type FotoElegida } from '../services/contracts';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Fotos de entrega del contrato (pedido del dueño, 2026-11-13). Mismos topes y textos que la web (`client/components/contracts/FotosDeEntrega.tsx`): al
 * tocar «Confirmar horas» se ofrece dejar fotos de cómo quedó (opcional) y, mientras el trabajo está en marcha o esperando la confirmación, cualquiera de las
 * dos partes puede agregar más. Es una prueba más, con autor y fecha; no cambia el estado del contrato ni mueve plata.
 */
export const FOTOS_POR_VEZ = 5;
export const TOPE_DE_FOTOS_DEL_CONTRATO = 8;

/** Selector del formulario «terminé el trabajo»: elige hasta 5 fotos de la galería, las muestra chicas y deja sacar alguna. */
export function SelectorDeFotos({ fotos, onChange, disabled, yaHay = 0 }: { fotos: FotoElegida[]; onChange: (f: FotoElegida[]) => void; disabled?: boolean; yaHay?: number }) {
  const { colors: tema } = useTheme();
  const lugar = Math.max(0, Math.min(FOTOS_POR_VEZ, TOPE_DE_FOTOS_DEL_CONTRATO - yaHay));
  if (lugar === 0) return null;

  const elegir = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir fotos.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: lugar - fotos.length,
      quality: 0.8,
    });
    if (r.canceled || !r.assets) return;
    const nuevas = r.assets.map((a) => ({ uri: a.uri, name: a.fileName || `foto_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' }));
    onChange([...fotos, ...nuevas].slice(0, lugar));
  };

  return (
    <View style={[styles.caja, { borderColor: tema.border }]} testID="selector-fotos-de-entrega">
      <Text style={[styles.titulo, { color: tema.text.primary }]}>Fotos de cómo quedó (opcional)</Text>
      <Text style={[styles.ayuda, { color: tema.text.secondary }]}>
        Mostrá el trabajo terminado: la otra parte las ve antes de confirmar y quedan como prueba. Hasta {lugar} fotos, de 5 MB cada una.
      </Text>
      {fotos.length > 0 && (
        <View style={styles.grilla}>
          {fotos.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={styles.miniatura}>
              <Image source={{ uri: f.uri }} style={styles.imagen} />
              <TouchableOpacity style={styles.sacar} onPress={() => onChange(fotos.filter((_, j) => j !== i))} disabled={disabled} accessibilityLabel="Sacar esta foto">
                <X size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {fotos.length < lugar && (
        <TouchableOpacity style={[styles.boton, { backgroundColor: tema.border }]} onPress={() => void elegir()} disabled={disabled} accessibilityRole="button">
          <Camera size={16} color={tema.text.primary} />
          <Text style={{ color: tema.text.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>{fotos.length === 0 ? 'Agregar fotos' : 'Agregar más'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** El panel del contrato: las fotos que dejaron las partes y, mientras se puede, el botón para agregar más. */
export default function FotosDeEntrega({ contractId, fotos, puedeAgregar, onCambio }: { contractId: string; fotos: FotoDeEntrega[]; puedeAgregar: boolean; onCambio: () => void }) {
  const { colors: tema } = useTheme();
  const { token } = useAuth();
  const [elegidas, setElegidas] = useState<FotoElegida[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  if (fotos.length === 0 && !puedeAgregar) return null;

  // Las fotos son privadas: la imagen se pide con la sesión de quien mira.
  const origen = API_URL.replace(/\/api\/?$/, '');

  const subir = async () => {
    if (elegidas.length === 0) return;
    setSubiendo(true);
    try {
      const r = await uploadDeliveryPhotos(contractId, elegidas);
      if (r.success) {
        setElegidas([]);
        onCambio();
      } else {
        Alert.alert('No se pudieron subir las fotos', r.message || 'Probá de nuevo en un momento.');
      }
    } catch (e: any) {
      Alert.alert('No se pudieron subir las fotos', e?.message || 'Probá de nuevo en un momento.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <View style={[styles.panel, { backgroundColor: tema.card, borderColor: tema.border }]} testID="fotos-de-entrega">
      <Text style={[styles.panelTitulo, { color: tema.text.primary }]}>Fotos de entrega{fotos.length > 0 ? ` (${fotos.length})` : ''}</Text>
      {fotos.length === 0 ? (
        <Text style={[styles.ayuda, { color: tema.text.secondary }]}>Todavía no hay fotos. Quien termina el trabajo puede dejar fotos de cómo quedó.</Text>
      ) : (
        <View style={styles.grilla}>
          {fotos.map((f, i) => (
            <View key={`${f.url}-${i}`} style={styles.miniatura}>
              <Image source={{ uri: `${origen}${f.url}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.imagen} />
              <Text style={styles.pie} numberOfLines={1}>{f.subidoPor === 'client' ? 'Cliente' : 'Trabajador'}</Text>
            </View>
          ))}
        </View>
      )}
      {puedeAgregar && fotos.length < TOPE_DE_FOTOS_DEL_CONTRATO && (
        <View style={{ marginTop: spacing.sm }}>
          <SelectorDeFotos fotos={elegidas} onChange={setElegidas} disabled={subiendo} yaHay={fotos.length} />
          {elegidas.length > 0 && (
            <TouchableOpacity style={[styles.subir, subiendo && { opacity: 0.6 }]} onPress={() => void subir()} disabled={subiendo} accessibilityRole="button" testID="subir-fotos-de-entrega">
              {subiendo ? <ActivityIndicator color="#fff" /> : <Text style={styles.subirTexto}>Subir {elegidas.length} foto(s)</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderStyle: 'dashed', borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.sm },
  titulo: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  ayuda: { fontSize: fontSize.xs, marginTop: 2 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  miniatura: { width: 64, height: 64, borderRadius: borderRadius.sm, overflow: 'hidden' },
  imagen: { width: '100%', height: '100%' },
  sacar: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 3 },
  pie: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9, paddingHorizontal: 3 },
  boton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.md, marginTop: spacing.sm },
  panel: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  panelTitulo: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  subir: { backgroundColor: colors.primary[600], alignItems: 'center', paddingVertical: 10, borderRadius: borderRadius.md, marginTop: spacing.sm },
  subirTexto: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
