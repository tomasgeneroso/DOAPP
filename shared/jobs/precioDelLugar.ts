/**
 * El precio de UN lugar de un trabajo para varios trabajadores (pedido del dueño, 2026-11-20).
 *
 * El presupuesto publicado es el total del trabajo y se reparte entre los lugares: un trabajo de $10.000 para 2 trabajadores paga $5.000 a cada uno. Al postularse, la web
 * manda ese precio por lugar; el servidor lo comparaba con el total ($5.000 ≠ $10.000) y lo marcaba como «contraoferta» en la notificación y en el mensaje, aunque el
 * trabajador pedía exactamente lo publicado para su lugar.
 */
export function lugaresDelTrabajo(trabajo: { maxWorkers?: unknown } | null | undefined): number {
  const n = Math.floor(Number(trabajo?.maxWorkers));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** El total publicado dividido entre los lugares, con dos decimales (sin cambios si el trabajo es de un solo lugar). */
export function precioDeUnLugar(trabajo: { price?: unknown; maxWorkers?: unknown } | null | undefined): number {
  const total = Number(trabajo?.price);
  if (!Number.isFinite(total)) return 0;
  return Math.round((total / lugaresDelTrabajo(trabajo)) * 100) / 100;
}

/** Si el precio ofrecido es distinto del publicado PARA ESE LUGAR (la única «contraoferta» de verdad). */
export function esContraoferta(trabajo: { price?: unknown; maxWorkers?: unknown } | null | undefined, precioOfrecido: unknown): boolean {
  return Math.abs(Number(precioOfrecido) - precioDeUnLugar(trabajo)) > 0.009;
}
