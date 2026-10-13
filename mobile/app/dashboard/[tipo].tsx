import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Pantalla from '../../components/Pantalla';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import {
  AYUDAS,
  ETIQUETAS_DE_ESTADO,
  TITULOS,
  esTipoDeDetalle,
  resumirDetalle,
  soyElCliente,
  traerContratos,
  type ContratoDelTablero,
} from '../../services/tablero';

/** Detalle del tablero por contrato: ingresos, gastos o contratos activos (`/dashboard/ingresos|gastos|activos`). */
export default function DetalleDelTablero() {
  const { tipo: crudo } = useLocalSearchParams<{ tipo: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const tipo = esTipoDeDetalle(crudo) ? crudo : null;
  const [contratos, setContratos] = useState<ContratoDelTablero[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const c = await traerContratos();
      if (c) {
        setContratos(c);
        setError('');
      } else setError('No se pudieron cargar los contratos.');
    } catch {
      setError('No se pudieron cargar los contratos.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!tipo) {
    return <Pantalla titulo="Detalle" error="No existe ese detalle." volverA="/dashboard" />;
  }

  const r = resumirDetalle(tipo, contratos, user?.id);
  const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
  const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—');
  const colorDelTotal = tipo === 'ingresos' ? colors.success[700] : tipo === 'gastos' ? colors.danger[600] : colors.primary[600];

  return (
    <Pantalla titulo={TITULOS[tipo]} cargando={cargando} error={error} onRefrescar={() => { setRefrescando(true); cargar(); }} refrescando={refrescando} volverA="/dashboard">
      <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>{AYUDAS[tipo]}</Text>

      <View style={styles.tarjetas}>
        <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.valor, { color: colorDelTotal }]}>{tipo === 'activos' ? r.cantidad : pesos(r.total)}</Text>
          <Text style={[styles.etiqueta, { color: themeColors.text.muted }]}>{tipo === 'activos' ? 'Contratos' : 'Total acumulado'}</Text>
        </View>
        {tipo === 'activos' ? (
          <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.valor, { color: themeColors.text.primary }]}>{pesos(r.total)}</Text>
            <Text style={[styles.etiqueta, { color: themeColors.text.muted }]}>En juego</Text>
          </View>
        ) : (
          <>
            <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.valor, { color: themeColors.text.primary }]}>{r.cantidad}</Text>
              <Text style={[styles.etiqueta, { color: themeColors.text.muted }]}>Contratos</Text>
            </View>
            <View style={[styles.tarjeta, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.valor, { color: themeColors.text.primary }]}>{pesos(r.promedio)}</Text>
              <Text style={[styles.etiqueta, { color: themeColors.text.muted }]}>Promedio</Text>
            </View>
          </>
        )}
      </View>

      {tipo === 'activos' && !!r.porEstado && (
        <Text style={[styles.ayuda, { color: themeColors.text.secondary }]}>
          {r.porEstado.pending || 0} pendientes · {r.porEstado.accepted || 0} aceptados · {r.porEstado.in_progress || 0} en curso
        </Text>
      )}

      {r.cantidad === 0 && !cargando && <Text style={[styles.vacio, { color: themeColors.text.muted }]}>No hay contratos para mostrar.</Text>}

      {r.contratos.map((c) => {
        const id = String(c.id || c._id);
        const otra = soyElCliente(c, user?.id) ? c.doer?.name : c.client?.name;
        return (
          <TouchableOpacity key={id} onPress={() => router.push(`/contracts/${id}` as any)} style={[styles.fila, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.titulo, { color: themeColors.text.primary }]} numberOfLines={1}>{c.job?.title || 'Contrato'}</Text>
              <Text style={[styles.dato, { color: themeColors.text.secondary }]}>
                {soyElCliente(c, user?.id) ? 'Trabajador' : 'Cliente'}: {otra || '—'} · {tipo === 'activos' ? ETIQUETAS_DE_ESTADO[c.status] || c.status : fecha(c.completedAt || c.endDate)}
              </Text>
            </View>
            <Text style={[styles.monto, { color: themeColors.text.primary }]}>{pesos(Number(c.price) || 0)}</Text>
          </TouchableOpacity>
        );
      })}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  ayuda: { fontSize: fontSize.sm, marginBottom: spacing.md },
  tarjetas: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  tarjeta: { flex: 1, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: 'center' },
  valor: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  etiqueta: { fontSize: fontSize.xs, marginTop: 2 },
  vacio: { textAlign: 'center', marginTop: spacing['2xl'] },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm },
  titulo: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  dato: { fontSize: fontSize.xs, marginTop: 2 },
  monto: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
