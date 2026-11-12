/**
 * Los ítems de una cotización (regla del dueño, 2026-11-12: una cotización de $0,00 se pudo enviar y al aceptarla Mercado Pago rechazaba el pago con
 * «unit_price invalid»). Cantidad y precio tienen que ser números mayores que cero y el total no puede ser cero. Lo usan el servidor (crear, editar,
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
    if (!Number.isFinite(precio) || precio <= 0) return `El ítem ${n} tiene precio $0: poné un precio mayor que cero.`;
    total += qty * precio;
  }
  return total > 0 ? null : 'El total de la cotización no puede ser $0.';
}

/** Un total que Mercado Pago aceptaría cobrar. */
export const totalCobrable = (total: unknown): boolean => Number.isFinite(Number(total)) && Number(total) > 0;
