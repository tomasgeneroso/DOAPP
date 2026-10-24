/**
 * Lo que el cliente tiene a favor PENDIENTE de liquidar: plata que es suya pero que todavía no está en su saldo porque el pago original sigue en Mercado
 * Pago. No se puede usar ni retirar hasta la fecha en que Mercado Pago lo libera; ahí pasa a su saldo.
 *
 * El servidor manda cada cosa con su motivo y su fecha (`GET /api/balance` → `aFavorPendienteDetalle`); la web y la app lo nombran igual desde acá.
 */
export type MotivoDelAFavor = 'sobrante_de_presupuesto' | 'cancelacion' | 'baja_de_precio' | 'otro';

export interface AFavorPendienteItem {
  id: string;
  monto: number;
  /** De dónde viene, para que el cliente lo vea con su nombre. */
  motivo: MotivoDelAFavor;
  descripcion: string;
  /** Cuándo pasa a ser saldo (ISO). */
  disponibleDesde: string | null;
}

/** A qué trabajo o contrato pertenece un cobro pendiente, para mostrarlo y poder abrirlo. */
export interface ReferenciaDelCobro {
  id: string;
  titulo: string;
}

/**
 * Una tarjeta de «Cobros pendientes»: plata que figura a nombre de la persona pero todavía no puede usar o retirar.
 *  - `a_favor`: devolución al cliente que espera a que la pasarela libere el pago original (todavía NO está en su saldo).
 *  - `en_liberacion`: ya está en su saldo (por ejemplo lo que cobra un trabajador por un contrato), pero se puede retirar recién desde `disponibleDesde`.
 */
export interface CobroPendiente {
  id: string;
  tipo: 'a_favor' | 'en_liberacion';
  monto: number;
  /** Cómo se llama en la tarjeta («Devolución por una cancelación», «Cobro de un contrato»…). */
  etiqueta: string;
  descripcion: string;
  /** Cuándo pasa a ser saldo (`a_favor`) o se puede retirar (`en_liberacion`), ISO. */
  disponibleDesde: string | null;
  trabajo: ReferenciaDelCobro | null;
  contrato: ReferenciaDelCobro | null;
}

export const ETIQUETA_DEL_A_FAVOR: Record<MotivoDelAFavor, string> = {
  sobrante_de_presupuesto: 'Sobrante de un presupuesto',
  cancelacion: 'Devolución por una cancelación',
  baja_de_precio: 'Baja de precio',
  otro: 'Devolución',
};

export const etiquetaDelAFavor = (motivo?: string | null): string => ETIQUETA_DEL_A_FAVOR[motivo as MotivoDelAFavor] ?? ETIQUETA_DEL_A_FAVOR.otro;

/** «DD/MM/AAAA» de una fecha ISO, o vacío si no hay fecha. */
export const fechaDeLiquidacion = (iso?: string | null): string => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');

/** ¿Este movimiento del libro es plata a favor PENDIENTE de liquidar? Figura en la lista, pero no sumó al saldo (ni se puede usar ni retirar) hasta liquidarse. */
export const esAFavorPendiente = (mov: { status?: string | null; metadata?: Record<string, unknown> | null }): boolean =>
  mov.status === 'pending' && mov.metadata?.pendienteDeLiquidacion === true;
