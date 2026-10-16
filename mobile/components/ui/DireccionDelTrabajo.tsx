import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { MapPin, Route } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { MINIMO_PARA_BUSCAR, buscarSugerencias, type CalleSugerida, type SugerenciaDeDireccion } from '../../../shared/geo/direcciones';
import { buscarLugares, detallesDeUbicacion, sanearCalle, sanearNumeroDePuerta, type LugarSugerido } from '../../../shared/geo/lugares';

/**
 * Ubicación, calle y número de puerta de un trabajo (lo mismo que la web).
 *
 *  - «Ubicación» ofrece lugares y direcciones reales (OpenStreetMap). Elegir una dirección exacta completa solos la calle, el número,
 *    el barrio y el código postal.
 *  - «Calle» ofrece calles reales de la zona elegida, con el rango de números que tienen; «Número de puerta» solo admite dígitos y
 *    avisa si el número no existe en la calle.
 *  - Lo que queda guardado está limpio: el número no se queda escrito dentro de la calle ni hay letras en el número.
 */
type Item = { tipo: 'direccion'; s: SugerenciaDeDireccion } | { tipo: 'calle'; c: CalleSugerida };

interface Props {
  location: string;
  onLocationChange: (v: string) => void;
  street: string;
  onStreetChange: (v: string) => void;
  number: string;
  onNumberChange: (v: string) => void;
  onNeighborhoodChange: (v: string) => void;
  onPostalCodeChange: (v: string) => void;
  onCoordinatesChange?: (lat: number, lon: number) => void;
  error?: string;
  themeColors: any;
}

export default function DireccionDelTrabajo({
  location,
  onLocationChange,
  street,
  onStreetChange,
  number,
  onNumberChange,
  onNeighborhoodChange,
  onPostalCodeChange,
  onCoordinatesChange,
  error,
  themeColors,
}: Props) {
  const [lugares, setLugares] = useState<LugarSugerido[]>([]);
  const [buscandoLugares, setBuscandoLugares] = useState(false);
  const [contexto, setContexto] = useState<{ provincia?: string; ciudad?: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [buscandoCalles, setBuscandoCalles] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rango, setRango] = useState<{ desde: number; hasta: number } | null>(null);
  const saltarLugares = useRef(false);
  const saltarCalles = useRef(false);

  const input = [styles.input, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }];
  const lista = [styles.lista, { backgroundColor: themeColors.card || '#fff', borderColor: themeColors.border }];

  // Provincia y localidad que acotan las calles: la elegida o la que se deduce de lo escrito («Ciudad, Provincia»).
  const contextoDeCalles = (() => {
    if (contexto?.provincia) return contexto;
    const partes = location.split(',').map((p) => p.trim()).filter(Boolean);
    return partes.length >= 2 ? { ciudad: partes[0], provincia: partes[partes.length - 1] } : {};
  })();

  // ── Ubicación: lugares reales ──
  useEffect(() => {
    if (saltarLugares.current) {
      saltarLugares.current = false;
      return;
    }
    if (location.trim().length < MINIMO_PARA_BUSCAR) {
      setLugares([]);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setBuscandoLugares(true);
      const r = await buscarLugares(location, { signal: control.signal });
      if (control.signal.aborted) return;
      setLugares(r);
      setBuscandoLugares(false);
    }, 600);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [location]);

  const elegirLugar = async (l: LugarSugerido) => {
    saltarLugares.current = true;
    saltarCalles.current = true;
    setLugares([]);
    onLocationChange(l.etiqueta);
    setContexto({ provincia: l.provincia || undefined, ciudad: l.ciudad || undefined });
    onCoordinatesChange?.(l.lat, l.lon);
    if (l.calle) {
      onStreetChange(l.calle);
      onNumberChange(l.numero);
      setRango(null);
    }
    if (l.barrio) onNeighborhoodChange(l.barrio);
    if (l.codigoPostal) onPostalCodeChange(l.codigoPostal);
    // Lo que no vino en la sugerencia se pide por su ubicación (una consulta por elección).
    if (!l.barrio || !l.codigoPostal) {
      const d = await detallesDeUbicacion(l.lat, l.lon, { userAgent: 'DoApp/2.0 (app movil)' });
      if (d) {
        if (!l.barrio && d.barrio) onNeighborhoodChange(d.barrio);
        if (!l.codigoPostal && d.codigoPostal) onPostalCodeChange(d.codigoPostal);
      }
    }
  };

  // ── Calle: calles reales con su rango; con número, direcciones completas ──
  const consulta = [street, number].filter(Boolean).join(' ').trim();
  useEffect(() => {
    if (saltarCalles.current) {
      saltarCalles.current = false;
      return;
    }
    if (consulta.length < MINIMO_PARA_BUSCAR) {
      setItems([]);
      setAviso(null);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setBuscandoCalles(true);
      const r = await buscarSugerencias(consulta, { signal: control.signal, ...contextoDeCalles });
      if (control.signal.aborted) return;
      setItems([...r.direcciones.map((s) => ({ tipo: 'direccion' as const, s })), ...r.calles.map((c) => ({ tipo: 'calle' as const, c }))]);
      setAviso(r.alturaInexistente ? `El número ${r.alturaInexistente.altura} no existe en esa calle: llega hasta el ${r.alturaInexistente.mayor}.` : null);
      setBuscandoCalles(false);
    }, 600);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, contextoDeCalles.provincia, contextoDeCalles.ciudad]);

  const elegirCalle = async (i: Item) => {
    saltarCalles.current = true;
    setItems([]);
    setAviso(null);
    if (i.tipo === 'calle') {
      onStreetChange(i.c.calle);
      setRango({ desde: i.c.desde, hasta: i.c.hasta });
      if (!location.trim() && (i.c.ciudad || i.c.provincia)) onLocationChange([i.c.ciudad, i.c.provincia].filter((x, n, a) => x && a.indexOf(x) === n).join(', '));
      return;
    }
    // Georef devuelve «Av Corrientes 1234» junto: se separa en sus dos campos.
    const { calle, numero } = sanearCalle(i.s.calle);
    onStreetChange(calle || i.s.calle);
    onNumberChange(numero);
    setRango(null);
    if (!location.trim() && (i.s.ciudad || i.s.provincia)) onLocationChange([i.s.ciudad, i.s.provincia].filter((x, n, a) => x && a.indexOf(x) === n).join(', '));
    if (i.s.lat !== undefined && i.s.lon !== undefined) {
      onCoordinatesChange?.(i.s.lat, i.s.lon);
      const d = await detallesDeUbicacion(i.s.lat, i.s.lon, { userAgent: 'DoApp/2.0 (app movil)' });
      if (d) {
        if (d.barrio) onNeighborhoodChange(d.barrio);
        if (d.codigoPostal) onPostalCodeChange(d.codigoPostal);
      }
    }
  };

  const alSalirDeLaCalle = () => {
    // Si quedó el número escrito en la calle y el campo del número está vacío, se pasa a su lugar.
    const { calle, numero } = sanearCalle(street);
    if (numero && !number) {
      onStreetChange(calle);
      onNumberChange(numero);
    }
  };

  const numeroFueraDeRango = rango && number && (Number(number) < rango.desde || Number(number) > rango.hasta);

  return (
    <View>
      {/* Ubicación */}
      <View style={[styles.grupo, { zIndex: 30 }]}>
        <Text style={[styles.label, { color: themeColors.text.primary }]}>Ciudad/Localidad o dirección *</Text>
        <View>
          <TextInput
            style={[...input, error ? { borderColor: colors.danger[500] } : null]}
            placeholder="Ej: Córdoba Capital, Córdoba"
            placeholderTextColor={themeColors.text.muted}
            value={location}
            onChangeText={onLocationChange}
            autoCorrect={false}
          />
          {buscandoLugares && <ActivityIndicator size="small" style={styles.cargando} color={colors.primary[500]} />}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {lugares.length > 0 && (
          <View style={lista}>
            {lugares.map((l, n) => (
              <TouchableOpacity key={l.etiqueta} style={[styles.fila, n < lugares.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }]} onPress={() => elegirLugar(l)} activeOpacity={0.7}>
                <MapPin size={14} color={colors.primary[500]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.filaTexto, { color: themeColors.text.primary }]} numberOfLines={2}>{l.etiqueta}</Text>
                  {l.numero ? <Text style={styles.exacta}>dirección exacta{l.codigoPostal ? ` · CP ${l.codigoPostal}` : ''}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Calle */}
      <View style={[styles.grupo, { zIndex: 20 }]}>
        <Text style={[styles.label, { color: themeColors.text.primary }]}>Calle</Text>
        <View>
          <TextInput
            style={input}
            placeholder="Ej: Av. Corrientes"
            placeholderTextColor={themeColors.text.muted}
            value={street}
            onChangeText={(v) => { onStreetChange(v.replace(/[<>]/g, '')); setRango(null); }}
            onBlur={alSalirDeLaCalle}
            maxLength={120}
            autoCorrect={false}
          />
          {buscandoCalles && <ActivityIndicator size="small" style={styles.cargando} color={colors.primary[500]} />}
        </View>
        {(items.length > 0 || aviso) && (
          <View style={lista}>
            {aviso ? <Text style={styles.avisoCalle}>{aviso}</Text> : null}
            {items.map((i, n) => (
              <TouchableOpacity
                key={i.tipo === 'direccion' ? `d:${i.s.etiqueta}` : `c:${i.c.etiqueta}`}
                style={[styles.fila, n < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }]}
                onPress={() => elegirCalle(i)}
                activeOpacity={0.7}
              >
                {i.tipo === 'direccion' ? <MapPin size={14} color={colors.primary[500]} /> : <Route size={14} color={themeColors.text.muted} />}
                <Text style={[styles.filaTexto, { color: themeColors.text.primary }]}>{i.tipo === 'direccion' ? i.s.etiqueta : i.c.etiqueta}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {rango && items.length === 0 ? (
          <Text style={styles.ayuda}>Escribí el número de la casa abajo: en esta calle existen del {rango.desde} al {rango.hasta}.</Text>
        ) : null}
      </View>

      {/* Número de puerta */}
      <View style={styles.grupo}>
        <Text style={[styles.label, { color: themeColors.text.primary }]}>Número de puerta</Text>
        <TextInput
          style={[...input, numeroFueraDeRango ? { borderColor: colors.danger[500] } : null]}
          placeholder="Ej: 1234"
          placeholderTextColor={themeColors.text.muted}
          value={number}
          onChangeText={(v) => onNumberChange(sanearNumeroDePuerta(v))}
          keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
          maxLength={6}
        />
        <Text style={styles.ayuda}>Solo números.</Text>
        {numeroFueraDeRango && rango ? <Text style={styles.error}>Ese número no existe en la calle elegida: va del {rango.desde} al {rango.hasta}.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { marginBottom: spacing.lg, position: 'relative' },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  input: { height: 48, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, fontSize: fontSize.base, borderWidth: 1 },
  cargando: { position: 'absolute', right: 12, top: 14 },
  error: { color: colors.danger[500], fontSize: fontSize.xs, marginTop: spacing.xs },
  ayuda: { color: colors.slate[500], fontSize: fontSize.xs, marginTop: spacing.xs },
  lista: { borderRadius: borderRadius.lg, borderWidth: 1, marginTop: 4, maxHeight: 260, overflow: 'hidden' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  filaTexto: { fontSize: fontSize.sm, flex: 1 },
  exacta: { fontSize: 11, color: colors.success?.[600] ?? '#059669', marginTop: 2 },
  avisoCalle: { fontSize: fontSize.xs, color: colors.warning?.[600] ?? '#b45309', backgroundColor: '#fffbeb', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
