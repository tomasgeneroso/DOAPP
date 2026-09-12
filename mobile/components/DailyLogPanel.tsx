import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, CheckCheck, FileText, Paperclip, Play } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { get, post, upload, getImageUrl } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

/**
 * Control diario del contrato.
 *
 * Un casillero por día. Cualquiera de las dos partes marca "se trabajó" y
 * puede adjuntar fotos o videos del avance. No mueve plata ni cambia estados:
 * es evidencia para la disputa, y una foto con fecha del día 3 vale más que
 * cualquier descripción escrita el día 10.
 */

interface Adjunto {
  url: string;
  nombre: string;
  tipo: string;
  bytes: number;
  subidoPor: 'client' | 'worker';
  subidoEl: string;
}

interface Dia {
  date: string;
  estado: 'sin_marcar' | 'pendiente' | 'confirmado';
  marcoTrabajador: boolean;
  marcoCliente: boolean;
  editable: boolean;
  adjuntos: Adjunto[];
}

interface DailyLogView {
  dias: Dia[];
  confirmados: number;
  total: number;
  diasSinMarcar: number;
  umbralAusencia: number;
  hayAlerta: boolean;
}

interface Props {
  contractId: string;
  rol: 'client' | 'worker';
  soloLectura?: boolean;
}

const MAX_ARCHIVOS = 5;

function fechaCorta(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function mimeDesdeUri(uri: string, tipoPicker?: string): string {
  const ext = (uri.split('.').pop() || '').toLowerCase();
  if (tipoPicker === 'video') {
    return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  }
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export default function DailyLogPanel({ contractId, rol, soloLectura = false }: Props) {
  const { colors: themeColors, isDarkMode } = useTheme();
  const [vista, setVista] = useState<DailyLogView | null>(null);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await get<DailyLogView>(`/contracts/${contractId}/daily-log`);
    if (res.success && res.data) setVista(res.data);
    setCargando(false);
  }, [contractId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcar = async (dia: Dia) => {
    if (soloLectura || !dia.editable) return;
    const yaMarque = rol === 'client' ? dia.marcoCliente : dia.marcoTrabajador;
    setMarcando(dia.date);
    const res = await post<DailyLogView>(`/contracts/${contractId}/daily-log`, {
      date: dia.date,
      marked: !yaMarque,
    });
    if (res.success && res.data) setVista(res.data);
    else Alert.alert('No se pudo marcar', res.message || 'Intentá de nuevo.');
    setMarcando(null);
  };

  const marcarTodos = async () => {
    if (soloLectura) return;
    setMarcando('todos');
    const res = await post<DailyLogView>(`/contracts/${contractId}/daily-log`, { todos: true });
    if (res.success && res.data) setVista(res.data);
    else Alert.alert('No se pudo marcar', res.message || 'Intentá de nuevo.');
    setMarcando(null);
  };

  const elegirYSubir = async (date: string) => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir fotos del avance.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ARCHIVOS,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    const form = new FormData();
    result.assets.slice(0, MAX_ARCHIVOS).forEach((a, i) => {
      const nombre = a.fileName || a.uri.split('/').pop() || `avance-${i + 1}.jpg`;
      const tipo = a.mimeType || mimeDesdeUri(a.uri, a.type ?? undefined);
      form.append('archivos', { uri: a.uri, name: nombre, type: tipo } as any);
    });

    setSubiendo(date);
    const res = await upload<DailyLogView>(
      `/contracts/${contractId}/daily-log/${date}/attachments`,
      form,
    );
    if (res.success && res.data) {
      setVista(res.data);
      setAbierto(date);
    } else {
      Alert.alert('No se pudo subir', res.message || 'Intentá de nuevo.');
    }
    setSubiendo(null);
  };

  if (cargando) {
    return (
      <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  if (!vista || vista.total === 0) return null;

  const hayPendientes = vista.dias.some(
    (d) => d.editable && !(rol === 'client' ? d.marcoCliente : d.marcoTrabajador),
  );

  return (
    <View style={[styles.section, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <View style={styles.cabecera}>
        <View style={{ flex: 1 }}>
          <View style={styles.tituloFila}>
            <CheckCheck size={18} color={colors.primary[500]} />
            <Text style={[styles.titulo, { color: themeColors.text.primary }]}>Control diario</Text>
          </View>
          <Text style={[styles.subtitulo, { color: themeColors.text.secondary }]}>
            Marcá los días que se trabajó y subí fotos del avance. Es tu evidencia si hay una
            disputa.
          </Text>
        </View>
        <View style={styles.contador}>
          <Text style={[styles.contadorNumero, { color: themeColors.text.primary }]}>
            {vista.confirmados}/{vista.total}
          </Text>
          <Text style={[styles.contadorLabel, { color: themeColors.text.muted }]}>confirmados</Text>
        </View>
      </View>

      {vista.hayAlerta && (
        <View style={styles.alerta}>
          <Text style={styles.alertaTexto}>
            Hace {vista.diasSinMarcar} días que nadie marca nada. Si se está trabajando, marcá los
            días para que quede registrado.
          </Text>
        </View>
      )}

      {!soloLectura && hayPendientes && (
        <TouchableOpacity
          style={[styles.botonTodos, { borderColor: colors.primary[300] }]}
          onPress={marcarTodos}
          disabled={marcando !== null}
        >
          {marcando === 'todos' ? (
            <ActivityIndicator size="small" color={colors.primary[600]} />
          ) : (
            <Text style={[styles.botonTodosTexto, { color: colors.primary[600] }]}>
              Marcar todos los días transcurridos
            </Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.lista}>
        {vista.dias.map((dia) => {
          const miMarca = rol === 'client' ? dia.marcoCliente : dia.marcoTrabajador;
          const otraMarca = rol === 'client' ? dia.marcoTrabajador : dia.marcoCliente;
          const estaAbierto = abierto === dia.date;
          const futuro = !dia.editable;

          const casillero =
            dia.estado === 'confirmado'
              ? { backgroundColor: colors.success[500], borderColor: colors.success[500] }
              : dia.estado === 'pendiente'
                ? { backgroundColor: colors.warning[100], borderColor: colors.warning[400] }
                : { backgroundColor: 'transparent', borderColor: themeColors.border };

          const tildeColor =
            dia.estado === 'confirmado'
              ? '#fff'
              : dia.estado === 'pendiente'
                ? colors.warning[600]
                : 'transparent';

          return (
            <View
              key={dia.date}
              style={[styles.fila, { borderBottomColor: themeColors.border, opacity: futuro ? 0.5 : 1 }]}
            >
              <View style={styles.filaPrincipal}>
                <TouchableOpacity
                  style={[styles.casillero, casillero]}
                  onPress={() => marcar(dia)}
                  disabled={soloLectura || futuro || marcando !== null}
                >
                  {marcando === dia.date ? (
                    <ActivityIndicator size="small" color={colors.slate[500]} />
                  ) : (
                    <Check size={16} color={tildeColor} />
                  )}
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.fecha, { color: themeColors.text.primary }]}>
                    {fechaCorta(dia.date)}
                  </Text>
                  {dia.estado === 'confirmado' && (
                    <Text style={[styles.estado, { color: colors.success[600] }]}>confirmado</Text>
                  )}
                  {dia.estado === 'pendiente' && (
                    <Text style={[styles.estado, { color: colors.warning[600] }]}>
                      {rol === 'client' ? 'el trabajador lo marcó' : 'falta que el cliente confirme'}
                    </Text>
                  )}
                  {dia.estado === 'sin_marcar' && otraMarca && (
                    <Text style={[styles.estado, { color: themeColors.text.muted }]}>
                      la otra parte lo marcó
                    </Text>
                  )}
                </View>

                {dia.adjuntos.length > 0 && (
                  <TouchableOpacity
                    style={styles.clip}
                    onPress={() => setAbierto(estaAbierto ? null : dia.date)}
                  >
                    <Paperclip size={14} color={themeColors.text.secondary} />
                    <Text style={[styles.clipTexto, { color: themeColors.text.secondary }]}>
                      {dia.adjuntos.length}
                    </Text>
                  </TouchableOpacity>
                )}

                {!soloLectura && !futuro && (
                  <TouchableOpacity
                    style={styles.camara}
                    onPress={() => elegirYSubir(dia.date)}
                    disabled={subiendo !== null}
                  >
                    {subiendo === dia.date ? (
                      <ActivityIndicator size="small" color={colors.primary[500]} />
                    ) : (
                      <Camera size={18} color={themeColors.text.secondary} />
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {estaAbierto && dia.adjuntos.length > 0 && (
                <View style={styles.galeria}>
                  {dia.adjuntos.map((a, i) => {
                    const src = getImageUrl(a.url);
                    const quien = a.subidoPor === 'client' ? 'Cliente' : 'Trabajador';
                    const cuando = new Date(a.subidoEl).toLocaleString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const esImagen = a.tipo.startsWith('image/');
                    const esVideo = a.tipo.startsWith('video/');
                    return (
                      <TouchableOpacity
                        key={`${a.url}-${i}`}
                        style={[styles.miniatura, { borderColor: themeColors.border, backgroundColor: isDarkMode ? colors.slate[800] : colors.slate[100] }]}
                        onPress={() => src && Linking.openURL(src)}
                      >
                        {esImagen && src ? (
                          <Image source={{ uri: src }} style={styles.miniaturaImagen} />
                        ) : esVideo ? (
                          <Play size={22} color={colors.slate[500]} />
                        ) : (
                          <FileText size={22} color={colors.slate[500]} />
                        )}
                        <View style={styles.miniaturaPie}>
                          <Text style={styles.miniaturaPieTexto} numberOfLines={1}>
                            {quien} · {cuando}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.pie, { color: themeColors.text.muted }]}>
        Hasta {MAX_ARCHIVOS} archivos por día. Cada uno queda con quién lo subió y cuándo, y entra
        primero en el expediente si hay disputa.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titulo: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  subtitulo: {
    fontSize: fontSize.sm,
    marginTop: 4,
    lineHeight: 18,
  },
  contador: {
    alignItems: 'flex-end',
  },
  contadorNumero: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  contadorLabel: {
    fontSize: fontSize.xs,
  },
  alerta: {
    marginTop: spacing.sm,
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[400],
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  alertaTexto: {
    fontSize: fontSize.sm,
    color: colors.warning[600],
  },
  botonTodos: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  botonTodosTexto: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  lista: {
    marginTop: spacing.sm,
  },
  fila: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filaPrincipal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  casillero: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fecha: {
    fontSize: fontSize.sm,
    textTransform: 'capitalize',
  },
  estado: {
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  clip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clipTexto: {
    fontSize: fontSize.xs,
  },
  camara: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galeria: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginLeft: 38,
  },
  miniatura: {
    width: 84,
    height: 84,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaImagen: {
    width: '100%',
    height: '100%',
  },
  miniaturaPie: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  miniaturaPieTexto: {
    color: '#fff',
    fontSize: 9,
  },
  pie: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
});
