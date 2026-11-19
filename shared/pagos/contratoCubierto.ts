/**
 * ¿El contrato ya está pago con la PUBLICACIÓN del trabajo? (pedido del dueño, 2026-11-20)
 *
 * En DOAPP primero se paga y después se elige: el cliente paga el presupuesto completo al publicar y cada contrato que sale de ese trabajo queda respaldado por ese pago
 * (en un trabajo de 2 lugares de $10.000, cada contrato de $5.000 sale de los $10.000 ya pagados). La pantalla del contrato le pedía igual «pagá $5.000» y la ruta de pago
 * armaba otra orden de Mercado Pago: se cobraba dos veces lo mismo. Se considera cubierto cuando la publicación está paga, el contrato sigue vigente y su precio entra en el
 * presupuesto pagado (lo que se pasa del presupuesto se paga por la cotización, antes de crear el contrato: `settleQuote`).
 */
export function contratoCubiertoPorLaPublicacion(
  contrato: { price?: unknown; status?: unknown } | null | undefined,
  trabajo: { publicationPaid?: unknown; price?: unknown } | null | undefined,
): boolean {
  if (!contrato || !trabajo || trabajo.publicationPaid !== true) return false;
  if (['cancelled', 'rejected'].includes(String(contrato.status))) return false;
  const precio = Number(contrato.price);
  const presupuesto = Number(trabajo.price);
  return Number.isFinite(precio) && Number.isFinite(presupuesto) && precio > 0 && precio <= presupuesto + 0.01;
}
