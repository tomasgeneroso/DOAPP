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
