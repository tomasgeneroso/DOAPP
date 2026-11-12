/**
 * Los ítems de una cotización (regla del dueño, 2026-11-12: una cotización de $0,00 se pudo enviar y al aceptarla Mercado Pago rechazaba el pago con
 * «unit_price invalid»). La cantidad tiene que ser mayor que cero, un ítem puede costar $0 (con que uno tenga precio alcanza) y el TOTAL no puede ser cero. Lo usan el servidor (crear, editar,
 * aceptar y pagar) y el formulario de la web, para avisar ANTES de enviar.
 */
export interface ItemDeCotizacion {
  qty?: unknown;
  unitPrice?: unknown;
  description?: unknown;
}

/** null si los ítems sirven; si no, el motivo en palabras simples. */
export function motivoDeItemsInvalidos(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return 'Agregá al menos un ítem.';
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const it = (items[i] ?? {}) as ItemDeCotizacion;
    const n = i + 1;
    if (!String(it.description ?? '').trim()) return `El ítem ${n} no tiene descripción.`;
    const qty = Number(it.qty);
    const precio = Number(it.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) return `El ítem ${n} tiene una cantidad inválida: tiene que ser mayor que cero.`;
    // Un ítem puede valer $0 (una cortesía, algo incluido): lo que no puede ser cero es el TOTAL (regla del dueño, 2026-11-12).
    if (!Number.isFinite(precio) || precio < 0) return `El ítem ${n} tiene un precio inválido: no puede ser negativo.`;
    total += qty * precio;
  }
  return total > 0 ? null : 'El total de la cotización tiene que ser mayor que $0: al menos un ítem tiene que tener precio.';
}

/** Un total que Mercado Pago aceptaría cobrar. */
export const totalCobrable = (total: unknown): boolean => Number.isFinite(Number(total)) && Number(total) > 0;
