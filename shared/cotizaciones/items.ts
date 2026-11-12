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

const redondear = (n: number): number => Math.round(n * 100) / 100;

export interface ItemEscalable {
  qty: number;
  unitPrice: number;
  description: string;
}

/** Subtotal y total de una lista de ítems con su IVA y otros impuestos (porcentajes). La misma cuenta que usa el servidor al crear una cotización. */
export function totalesDeItems(items: Array<{ qty: number; unitPrice: number }>, taxRate: number, otrosImpuestos: Array<{ rate: number }> = []): { subtotal: number; total: number } {
  const subtotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);
  const factor = 1 + Number(taxRate || 0) / 100 + otrosImpuestos.reduce((s, t) => s + Number(t.rate || 0) / 100, 0);
  return { subtotal: redondear(subtotal), total: redondear(subtotal * factor) };
}

/**
 * Lleva una cotización a un TOTAL distinto (contraoferta aceptada): reparte el cambio en proporción entre los ítems que tenían precio (los de $0 quedan en $0).
 * El resultado suma el total pedido (a lo sumo un centavo de diferencia por redondeo): el desvío de redondeo va al ítem de mayor precio si es de cantidad 1; si no hay uno, queda un solo ítem
 * «Servicio acordado». Devuelve null si el total pedido no es un número mayor que cero.
 */
export function escalarAlTotal(items: ItemEscalable[], taxRate: number, otrosImpuestos: Array<{ rate: number }>, totalPedido: number): ItemEscalable[] | null {
  const pedido = Number(totalPedido);
  if (!Number.isFinite(pedido) || pedido <= 0) return null;
  const factor = 1 + Number(taxRate || 0) / 100 + otrosImpuestos.reduce((s, t) => s + Number(t.rate || 0) / 100, 0);
  // El subtotal va en centavos y el total sale de multiplicarlo por el IVA: no todo total tiene un subtotal exacto. Se elige el subtotal cuyo total queda más cerca
  // del pedido (casi siempre exacto; a lo sumo un centavo de diferencia).
  const base = Math.floor((pedido / factor) * 100);
  let subtotalObjetivo = redondear(base / 100);
  for (let c = base - 2; c <= base + 3; c++) {
    if (Math.abs(redondear((c / 100) * factor) - pedido) < Math.abs(redondear(subtotalObjetivo * factor) - pedido) - 1e-9) subtotalObjetivo = redondear(c / 100);
  }
  const actual = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const unico = (): ItemEscalable[] => [{ description: 'Servicio acordado', qty: 1, unitPrice: subtotalObjetivo }];
  if (!(actual > 0)) return unico();

  const k = subtotalObjetivo / actual;
  const nuevos = items.map((i) => ({ ...i, unitPrice: redondear(i.unitPrice * k) }));
  const diferencia = redondear(subtotalObjetivo - nuevos.reduce((s, i) => s + i.qty * i.unitPrice, 0));
  if (diferencia === 0) return nuevos;
  let mayor = -1;
  nuevos.forEach((i, idx) => {
    if (i.qty === 1 && i.unitPrice > 0 && (mayor === -1 || i.unitPrice > nuevos[mayor].unitPrice)) mayor = idx;
  });
  if (mayor === -1) return unico();
  nuevos[mayor] = { ...nuevos[mayor], unitPrice: redondear(nuevos[mayor].unitPrice + diferencia) };
  return nuevos;
}
