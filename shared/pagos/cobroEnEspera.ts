/**
 * Los textos de un cobro EN ESPERA DE LIBERACIÓN, una sola vez para la web y la app (pedido del dueño, 2026-11-13): se muestra cuánto hay en espera, cuántos días
 * faltan, se recuerda cuánto tarda en liberarse y se dice si ya se puede retirar o no. Los números salen de `POLITICAS`: no se repiten a mano.
 *
 * Pura (sin base de datos ni pantalla) para poder probarla.
 */
import { POLITICAS } from '../constants/policies.js';

const DIA_MS = 86_400_000;

/** Días enteros que faltan hasta una fecha (redondeado hacia arriba: «faltan 3 días» hasta que llegue). 0 si ya pasó o no hay fecha. */
export function diasQueFaltan(desdeIso: string | null | undefined, ahora: Date = new Date()): number {
  if (!desdeIso) return 0;
  const t = new Date(desdeIso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - ahora.getTime()) / DIA_MS));
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR');
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El recordatorio de cuánto tarda en liberarse, siempre el mismo. */
export const RECORDATORIO_DE_LIBERACION =
  `Cada pago se libera a los ${POLITICAS.DIAS_LIBERACION_PAGO} días de acreditado (Mercado Pago) y el cliente puede reclamar hasta ${POLITICAS.DIAS_PARA_DISPUTAR} días después de terminado el trabajo: ` +
  'el cobro se puede retirar cuando pasaron los dos plazos.';

export interface CobroParaDecir {
  /** ¿Ya se puede retirar / pedir? */
  liberado: boolean;
  /** Cuándo se libera (ISO). */
  disponibleDesde: string | null;
  /** Si el trabajador ya pidió el cobro de este contrato (ISO). */
  pedidoEl?: string | null;
}

export interface TextoDelCobro {
  /** El estado en pocas palabras. */
  estado: string;
  /** Lo que falta o lo que sigue, con la fecha y los días. */
  detalle: string;
  /** ¿Se puede pedir el cobro ahora? */
  puedePedir: boolean;
}

/**
 * Qué decirle al trabajador de un cobro de un contrato terminado: en espera (con los días que faltan), liberado (se puede pedir) o ya pedido (lo paga el equipo).
 * Lo que llega por SALDO (trabajos de varios lugares) usa el mismo texto con «retirar» en vez de «pedir el cobro» (`conSaldo`).
 */
export function textoDelCobro(c: CobroParaDecir, ahora: Date = new Date(), conSaldo = false): TextoDelCobro {
  const verbo = conSaldo ? 'retirar' : 'pedir el cobro';
  if (c.pedidoEl) {
    return {
      estado: 'Cobro pedido',
      detalle: `Pediste el cobro el ${fecha(c.pedidoEl)}. El equipo de DOAPP te transfiere a tu cuenta y te avisamos cuando se acredite.`,
      puedePedir: false,
    };
  }
  const dias = diasQueFaltan(c.disponibleDesde, ahora);
  if (c.liberado || dias === 0) {
    return {
      estado: 'Liberado',
      detalle: conSaldo ? 'Ya está liberado: lo podés retirar.' : 'Ya está liberado: pedí el cobro y el equipo de DOAPP te transfiere a tu cuenta.',
      puedePedir: !conSaldo,
    };
  }
  return {
    estado: 'En espera de liberación',
    detalle: `Faltan ${plural(dias, 'día', 'días')}: desde el ${fecha(c.disponibleDesde as string)} lo podés ${verbo}. ${RECORDATORIO_DE_LIBERACION}`,
    puedePedir: false,
  };
}

// ───────────────────────── Cómo se ve un cobro en el historial ─────────────────────────

export interface MovimientoDelHistorial {
  type?: string;
  status?: string;
  amount?: number | string;
  description?: string | null;
  relatedContractId?: string | null;
  metadata?: Record<string, any> | null;
}

const esUnCobro = (m: MovimientoDelHistorial): boolean => m.type === 'payment' && Number(m.amount) > 0;

/** ¿Este movimiento cambió el saldo? Uno pendiente todavía no, y uno pagado por transferencia a la cuenta de la persona nunca pasa por el saldo. */
export const cambiaElSaldo = (m: MovimientoDelHistorial): boolean => m.status === 'completed' && m.metadata?.fueraDelSaldo !== true;

export type EstadoDeUnCobro = 'pendiente' | 'pagado_a_tu_cuenta' | 'en_tu_saldo';

/** El MISMO movimiento cambia de estado: primero «pendiente» y después pagado o acreditado. `null` si no es un cobro por un trabajo. */
export function estadoDelCobro(m: MovimientoDelHistorial): { clave: EstadoDeUnCobro; rotulo: string } | null {
  if (!esUnCobro(m)) return null;
  if (m.status !== 'completed') return { clave: 'pendiente', rotulo: 'Pendiente: te lo paga DOAPP' };
  return m.metadata?.fueraDelSaldo === true
    ? { clave: 'pagado_a_tu_cuenta', rotulo: 'Pagado por DOAPP a tu cuenta' }
    : { clave: 'en_tu_saldo', rotulo: 'Acreditado en tu saldo' };
}

/** El texto del movimiento sin el estado escrito adentro (los viejos decían «Pago pendiente…» aun después de pagados, o mostraban el id del contrato). */
export function descripcionDelMovimiento(m: MovimientoDelHistorial): string {
  const t = String(m.description ?? '');
  const viejo = t.match(/^Pago pendiente por trabajo completado: (.+)$/) || t.match(/^Pago por contrato #[0-9a-f-]{36} - (.+)$/i) || (esUnCobro(m) ? t.match(/^Pago por contrato - (.+)$/) : null);
  return viejo ? `Cobro por el trabajo «${viejo[1]}»` : t;
}

/**
 * UN renglón por cobro de cada contrato (las filas que quedaron repetidas antes de que hubiera un solo movimiento por contrato): si ya está acreditado o pagado, se saca la
 * «pendiente»; si quedaron dos «pendientes», se muestra una (la primera que viene, la más nueva). `yaCobrados`: contratos con un cobro terminado, incluidos los de otras páginas.
 */
export function sinCobrosRepetidos<T extends MovimientoDelHistorial>(movimientos: T[], yaCobrados: ReadonlySet<string> = new Set()): T[] {
  const cobrados = new Set(yaCobrados);
  for (const m of movimientos) if (esUnCobro(m) && m.status === 'completed' && m.relatedContractId) cobrados.add(String(m.relatedContractId));
  const pendientesVistos = new Set<string>();
  return movimientos.filter((m) => {
    if (!esUnCobro(m) || m.status !== 'pending' || !m.relatedContractId) return true;
    const contrato = String(m.relatedContractId);
    if (cobrados.has(contrato) || pendientesVistos.has(contrato)) return false;
    pendientesVistos.add(contrato);
    return true;
  });
}
