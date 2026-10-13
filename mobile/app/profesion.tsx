import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ShieldCheck, AlertCircle, Camera, ImageIcon, X, Eye } from 'lucide-react-native';
import Pantalla from '../components/Pantalla';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getToken } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import {
  PROFESIONES,
  direccionDelArchivo,
  esRegulada,
  estadoDeLaMatricula,
  guardarDatosProfesionales,
  quitarArchivoDeMatricula,
  subirArchivoDeMatricula,
  validarDatosProfesionales,
  type LadoDelArchivo,
} from '../services/matricula';

/**
 * Profesión y matrícula. Es lo mismo que Configuración → Profesión y matrícula de la web.
 *
 * Los archivos (frente y reverso) se guardan encriptados; DOAPP no verifica la matrícula; quien te contrata puede verla una
 * vez que hay un contrato entre los dos (Términos 4.6).
 */
export default function ProfesionScreen() {
  const { colors: themeColors } = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const [profesion, setProfesion] = useState('');
  const [numero, setNumero] = useState('');
  const [categoria, setCategoria] = useState('');
  const [certificado, setCertificado] = useState('');
  const [frente, setFrente] = useState<string | null>(null);
  const [dorso, setDorso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState<LadoDelArchivo | null>(null);
  const [error, setError] = useState('');
  const [viendo, setViendo] = useState<{ url: string; token: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    setProfesion(user.profession || '');
    setNumero(user.licenseNumber || '');
    setCategoria(user.licenseCategory || '');
    setCertificado(user.licenseCertNumber || '');
    setFrente(user.licenseDocumentUrl || null);
    setDorso(user.licenseDocumentBackUrl || null);
  }, [user?.id, user?.licenseDocumentUrl, user?.licenseDocumentBackUrl]);

  const regulada = esRegulada(profesion);
  const estado = estadoDeLaMatricula(user);

  const guardar = async () => {
    setError('');
    const v = validarDatosProfesionales({ profession: profesion, licenseNumber: numero, licenseCategory: categoria, licenseCertNumber: certificado });
    if (v.ok === false) {
      setError(v.error);
      return;
    }
    setGuardando(true);
    try {
      const r = await guardarDatosProfesionales(v.cuerpo);
      if (r.ok) {
        await refreshUser?.();
        Alert.alert('Listo', 'Tus datos profesionales quedaron guardados.');
      } else setError(r.mensaje);
    } finally {
      setGuardando(false);
    }
  };

  const elegir = async (lado: LadoDelArchivo, camara: boolean) => {
    const permiso = camara ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Permiso requerido', camara ? 'Necesitamos acceso a la cámara' : 'Necesitamos acceso a tu galería');
      return;
    }
    const r = camara
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    setError('');
    setOcupado(lado);
    try {
      const res = await subirArchivoDeMatricula(lado, r.assets[0].uri);
      if (res.ok) {
        setFrente(res.frente);
        setDorso(res.dorso);
        await refreshUser?.();
      } else setError(res.mensaje);
    } finally {
      setOcupado(null);
    }
  };

  const quitar = (lado: LadoDelArchivo) =>
    Alert.alert('Quitar archivo', `¿Quitás ${lado === 'front' ? 'el frente' : 'el reverso'} de tu matrícula?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          setOcupado(lado);
          try {
            const res = await quitarArchivoDeMatricula(lado);
            if (res.ok) {
              setFrente(res.frente);
              setDorso(res.dorso);
              await refreshUser?.();
            } else setError(res.mensaje);
          } finally {
            setOcupado(null);
          }
        },
      },
    ]);

  const ver = async (ruta: string | null) => {
    const url = direccionDelArchivo(ruta);
    if (!url) {
      setError('No se pudo abrir el archivo.');
      return;
    }
    setViendo({ url, token: await getToken() });
  };

  const fila = (lado: LadoDelArchivo, titulo: string, ruta: string | null, habilitada: boolean) => (
    <View style={[styles.archivo, { borderColor: themeColors.border }]}>
      <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>{titulo}</Text>
      {ruta ? (
        <View style={styles.fila}>
          <ShieldCheck size={18} color={colors.success[600]} />
          <Text style={[styles.dato, { color: themeColors.text.secondary, flex: 1 }]}>Cargado (guardado encriptado)</Text>
          <TouchableOpacity onPress={() => ver(ruta)} accessibilityLabel={`Ver ${titulo}`} style={styles.icono}>
            <Eye size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => quitar(lado)}
            disabled={ocupado !== null || (lado === 'front' && !!dorso)}
            accessibilityLabel={`Quitar ${titulo}`}
            style={[styles.icono, (ocupado !== null || (lado === 'front' && !!dorso)) && { opacity: 0.4 }]}
          >
            <X size={20} color={colors.danger[600]} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.fila}>
          {ocupado === lado ? (
            <ActivityIndicator color={colors.primary[600]} />
          ) : (
            <>
              <TouchableOpacity disabled={!habilitada || ocupado !== null} onPress={() => elegir(lado, true)} style={[styles.botonChico, { borderColor: themeColors.border }, !habilitada && { opacity: 0.4 }]}>
                <Camera size={18} color={colors.primary[600]} />
                <Text style={styles.botonChicoTexto}>Sacar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={!habilitada || ocupado !== null} onPress={() => elegir(lado, false)} style={[styles.botonChico, { borderColor: themeColors.border }, !habilitada && { opacity: 0.4 }]}>
                <ImageIcon size={18} color={colors.primary[600]} />
                <Text style={styles.botonChicoTexto}>Galería</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {!ruta && !habilitada && <Text style={[styles.ayuda, { color: themeColors.text.muted }]}>Subí primero el frente.</Text>}
    </View>
  );

  const campo = (titulo: string, valor: string, cambiar: (v: string) => void, ejemplo: string) => (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>{titulo} *</Text>
      <TextInput
        value={valor}
        onChangeText={cambiar}
        placeholder={ejemplo}
        placeholderTextColor={themeColors.text.muted}
        autoCapitalize="characters"
        style={[styles.input, { color: themeColors.text.primary, borderColor: themeColors.border }]}
      />
    </View>
  );

  return (
    <Pantalla titulo="Profesión y matrícula" error={error}>
      <Text style={[styles.etiqueta, { color: themeColors.text.primary }]}>Profesión</Text>
      <View style={styles.chips}>
        {PROFESIONES.map((p) => {
          const elegida = profesion === p.valor;
          return (
            <TouchableOpacity
              key={p.valor || 'ninguna'}
              onPress={() => setProfesion(p.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegida }}
              style={[styles.chip, { borderColor: elegida ? colors.primary[600] : themeColors.border, backgroundColor: elegida ? colors.primary[50] : 'transparent' }]}
            >
              <Text style={{ color: elegida ? colors.primary[700] : themeColors.text.primary, fontSize: fontSize.sm }}>{p.etiqueta}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {regulada && (
        <View style={[styles.caja, { borderColor: colors.warning[400], backgroundColor: colors.warning[50] }]}>
          <View style={styles.fila}>
            {estado.tipo === 'rechazada' ? <AlertCircle size={18} color={colors.danger[600]} /> : <ShieldCheck size={18} color={colors.success[600]} />}
            <Text style={{ flex: 1, color: colors.slate[800], fontSize: fontSize.sm }}>{estado.texto}</Text>
          </View>
          {estado.tipo === 'rechazada' && !!estado.motivo && <Text style={{ color: colors.danger[600], fontSize: fontSize.sm, marginTop: spacing.xs }}>Motivo: {estado.motivo}</Text>}

          <View style={{ marginTop: spacing.md }}>
            {campo('Número de matrícula', numero, setNumero, 'Ej.: MP-12345')}
            {campo('Categoría', categoria, setCategoria, 'Ej.: Primera')}
            {campo('N° de certificado', certificado, setCertificado, 'Ej.: 9876')}
          </View>

          {fila('front', 'Frente de la matrícula *', frente, true)}
          {fila('back', 'Reverso (si tiene)', dorso, !!frente)}

          <Text style={[styles.ayuda, { color: colors.slate[700], marginTop: spacing.sm }]}>
            Tus archivos se guardan encriptados. DOAPP no verifica la matrícula: se basa en tu buena fe, y quien te contrata puede verla para comprobarla por su cuenta una vez que hay un contrato entre los dos.
          </Text>
        </View>
      )}

      {!regulada && !!profesion && (
        <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>Tu profesión no requiere matrícula. Se muestra en tu perfil público.</Text>
      )}

      <TouchableOpacity style={[styles.guardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.guardarTexto}>Guardar</Text>}
      </TouchableOpacity>

      <Modal visible={!!viendo} transparent animationType="fade" onRequestClose={() => setViendo(null)}>
        <View style={styles.visor}>
          <TouchableOpacity style={styles.cerrar} onPress={() => setViendo(null)} accessibilityLabel="Cerrar">
            <X size={28} color="#fff" />
          </TouchableOpacity>
          {viendo && (
            <Image
              source={{ uri: viendo.url, headers: viendo.token ? { Authorization: `Bearer ${viendo.token}` } : undefined }}
              style={styles.imagen}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  caja: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 46, fontSize: fontSize.base, backgroundColor: '#fff' },
  archivo: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.md, backgroundColor: '#fff' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dato: { fontSize: fontSize.sm },
  icono: { padding: spacing.xs },
  botonChico: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  botonChicoTexto: { color: colors.primary[700], fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  ayuda: { fontSize: fontSize.xs, lineHeight: 17, marginTop: spacing.xs },
  guardar: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  guardarTexto: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  visor: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  cerrar: { position: 'absolute', top: 50, right: 20, zIndex: 2, padding: spacing.sm },
  imagen: { width: '100%', height: '80%' },
});
