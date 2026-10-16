import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { semanasDelMes, textoDeFecha } from '../../services/calendario';

/**
 * Inicio y fin del trabajo en UN solo calendario (como los pasajes): se toca el primer día y después el último, y los días del medio
 * quedan marcados. Las horas se eligen debajo. Con `finOpcional` («todavía no sé cuándo termina») alcanza con el día de inicio.
 */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
const PASO_MINUTOS = 15;

const sinHora = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mismoDia = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();
const dos = (n: number) => String(n).padStart(2, '0');
const minutosDe = (d: Date | null, porDefecto: number) => (d ? d.getHours() * 60 + d.getMinutes() : porDefecto);
const hhmm = (min: number) => `${dos(Math.floor(min / 60))}:${dos(min % 60)}`;
const conHora = (dia: Date, min: number) => new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), Math.floor(min / 60), min % 60);

interface Props {
  inicio: Date | null;
  fin: Date | null;
  onChange: (inicio: Date | null, fin: Date | null) => void;
  finOpcional?: boolean;
  error?: string;
  themeColors: any;
  placeholder?: string;
}

export default function RangoDeFechas({ inicio, fin, onChange, finOpcional = false, error, themeColors, placeholder = 'Elegí cuándo empieza y cuándo termina' }: Props) {
  const [abierto, setAbierto] = useState(false);
  const hoy = useMemo(() => sinHora(new Date()), []);
  const [mostrado, setMostrado] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [diaInicio, setDiaInicio] = useState<Date | null>(null);
  const [diaFin, setDiaFin] = useState<Date | null>(null);
  const [minInicio, setMinInicio] = useState(9 * 60);
  const [minFin, setMinFin] = useState(18 * 60);

  // Al abrir se parte de lo que ya estaba elegido.
  useEffect(() => {
    if (!abierto) return;
    setDiaInicio(inicio ? sinHora(inicio) : null);
    setDiaFin(fin ? sinHora(fin) : null);
    setMinInicio(minutosDe(inicio, 9 * 60));
    setMinFin(minutosDe(fin, 18 * 60));
    const base = inicio ?? hoy;
    setMostrado({ anio: base.getFullYear(), mes: base.getMonth() });
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const semanas = useMemo(() => semanasDelMes(mostrado.anio, mostrado.mes), [mostrado]);

  const tocarDia = (d: Date) => {
    if (d < hoy) return;
    if (finOpcional) {
      setDiaInicio(d);
      setDiaFin(null);
      return;
    }
    if (!diaInicio || (diaInicio && diaFin)) {
      setDiaInicio(d);
      setDiaFin(null);
    } else if (d < diaInicio) {
      setDiaInicio(d);
    } else {
      setDiaFin(d);
    }
  };

  // El mismo día: el fin tiene que ser después del inicio.
  const mismoDiaInicioFin = mismoDia(diaInicio, diaFin);
  const finMinimo = mismoDiaInicioFin ? minInicio + PASO_MINUTOS : 0;
  const finEfectivo = Math.max(minFin, finMinimo);

  const moverMes = (delta: number) => {
    const d = new Date(mostrado.anio, mostrado.mes + delta, 1);
    // No se navega a meses que ya pasaron enteros.
    if (d < new Date(hoy.getFullYear(), hoy.getMonth(), 1)) return;
    setMostrado({ anio: d.getFullYear(), mes: d.getMonth() });
  };

  const paso = (valor: number, delta: number) => Math.min(24 * 60 - PASO_MINUTOS, Math.max(0, valor + delta * PASO_MINUTOS));

  const listo = !!diaInicio && (finOpcional || !!diaFin);
  const confirmar = () => {
    if (!diaInicio) return;
    onChange(conHora(diaInicio, minInicio), finOpcional || !diaFin ? null : conHora(diaFin, finEfectivo));
    setAbierto(false);
  };

  const dias = diaInicio && diaFin ? Math.round((diaFin.getTime() - diaInicio.getTime()) / 86_400_000) + 1 : null;
  const texto = inicio ? `${textoDeFecha(inicio)}${finOpcional || !fin ? '' : `  →  ${textoDeFecha(fin)}`}` : '';

  const celda = (d: Date | null, i: number) => {
    if (!d) return <View key={`h${i}`} style={styles.celda} />;
    const pasado = d < hoy;
    const esInicio = mismoDia(d, diaInicio);
    const esFin = mismoDia(d, diaFin);
    const enMedio = !!diaInicio && !!diaFin && d > diaInicio && d < diaFin;
    const marcado = esInicio || esFin;
    return (
      <TouchableOpacity
        key={d.getTime()}
        style={[styles.celda, enMedio && { backgroundColor: themeColors.primary[50] }]}
        onPress={() => tocarDia(d)}
        disabled={pasado}
        accessibilityLabel={`${d.getDate()} de ${MESES[d.getMonth()]}${esInicio ? ', inicio' : ''}${esFin ? ', fin' : ''}`}
        accessibilityState={{ selected: marcado, disabled: pasado }}
      >
        <View style={[styles.dia, marcado && { backgroundColor: colors.primary[600] }, !marcado && mismoDia(d, hoy) && { borderWidth: 1, borderColor: colors.primary[600] }]}>
          <Text style={{ color: marcado ? '#fff' : pasado ? themeColors.text.muted : themeColors.text.primary, opacity: pasado ? 0.4 : 1, fontSize: fontSize.sm, fontWeight: marcado ? fontWeight.bold : fontWeight.medium }}>
            {d.getDate()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const reloj = (titulo: string, valor: number, cambiar: (v: number) => void, minimo = 0) => (
    <View style={styles.reloj}>
      <Text style={[styles.relojTitulo, { color: themeColors.text.muted }]}>{titulo}</Text>
      <View style={styles.relojFila}>
        <TouchableOpacity style={[styles.paso, { borderColor: themeColors.border }]} onPress={() => cambiar(Math.max(minimo, paso(valor, -1)))} accessibilityLabel={`${titulo}: antes`}>
          <Minus size={16} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.relojHora, { color: themeColors.text.primary }]}>{hhmm(valor)}</Text>
        <TouchableOpacity style={[styles.paso, { borderColor: themeColors.border }]} onPress={() => cambiar(paso(valor, 1))} accessibilityLabel={`${titulo}: después`}>
          <Plus size={16} color={themeColors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View>
      <TouchableOpacity
        style={[styles.campo, { backgroundColor: themeColors.slate[50], borderColor: error ? colors.danger[500] : themeColors.border }]}
        onPress={() => setAbierto(true)}
        accessibilityLabel="Elegir fechas del trabajo"
      >
        <Calendar size={16} color={inicio ? themeColors.text.primary : themeColors.text.muted} strokeWidth={2} />
        <Text style={{ flex: 1, color: inicio ? themeColors.text.primary : themeColors.text.muted, fontSize: fontSize.sm }} numberOfLines={2}>
          {texto || placeholder}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <TouchableOpacity style={styles.fondo} activeOpacity={1} onPress={() => setAbierto(false)} />
        <View style={[styles.hoja, { backgroundColor: themeColors.card }]}>
          <View style={[styles.cabecera, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity onPress={() => setAbierto(false)}>
              <Text style={{ color: themeColors.text.secondary, fontSize: fontSize.base }}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={{ color: themeColors.text.primary, fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>
              {finOpcional ? 'Día de inicio' : 'Fechas del trabajo'}
            </Text>
            <TouchableOpacity onPress={confirmar} disabled={!listo}>
              <Text style={{ color: listo ? colors.primary[600] : themeColors.text.muted, fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>Listo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mesFila}>
            <TouchableOpacity onPress={() => moverMes(-1)} style={styles.mesBoton} accessibilityLabel="Mes anterior">
              <ChevronLeft size={22} color={themeColors.text.primary} />
            </TouchableOpacity>
            <Text style={{ color: themeColors.text.primary, fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>
              {MESES[mostrado.mes]} {mostrado.anio}
            </Text>
            <TouchableOpacity onPress={() => moverMes(1)} style={styles.mesBoton} accessibilityLabel="Mes siguiente">
              <ChevronRight size={22} color={themeColors.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.semana}>
            {DIAS.map((d) => (
              <Text key={d} style={[styles.encabezadoDia, { color: themeColors.text.muted }]}>{d}</Text>
            ))}
          </View>
          {semanas.map((sem, i) => (
            <View key={i} style={styles.semana}>
              {sem.map((d, j) => celda(d, i * 7 + j))}
            </View>
          ))}

          <Text style={[styles.resumen, { color: themeColors.text.secondary }]}>
            {!diaInicio ? 'Tocá el primer día.' : finOpcional ? 'Listo: elegí la hora de inicio.' : !diaFin ? 'Ahora tocá el último día.' : `${dias} ${dias === 1 ? 'día' : 'días'}`}
          </Text>

          <View style={styles.relojes}>
            {reloj('Hora de inicio', minInicio, setMinInicio)}
            {!finOpcional && reloj('Hora de fin', finEfectivo, setMinFin, finMinimo)}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  campo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  error: { color: colors.danger[500], fontSize: fontSize.xs, marginTop: spacing.xs },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  hoja: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, paddingBottom: spacing.xl },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1 },
  mesFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mesBoton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  semana: { flexDirection: 'row', paddingHorizontal: spacing.sm },
  encabezadoDia: { flex: 1, textAlign: 'center', fontSize: fontSize.xs, paddingVertical: spacing.xs },
  celda: { flex: 1, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
  dia: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  resumen: { textAlign: 'center', fontSize: fontSize.sm, marginTop: spacing.sm },
  relojes: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.md, marginTop: spacing.md },
  reloj: { alignItems: 'center', gap: spacing.xs },
  relojTitulo: { fontSize: fontSize.xs },
  relojFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  relojHora: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, minWidth: 62, textAlign: 'center' },
  paso: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
