/** Formatos compartidos por las fichas del panel de administración: plata, fechas y estados en palabras. */
/** Plata en pesos: sin decimales si es redonda, con dos si no ($431.956,80, no $431.956,8). */
export const $ = (n: number) => {
  const r = Math.abs(Math.round(n * 100) / 100);
  return (n < 0 ? "-" : "") + "$" + r.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 });
};
export const dia = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const diaYHora = (v: string) => new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const ESTADOS: Record<string, string> = {
  pending: "Pendiente", ready: "Listo", accepted: "Aceptado", in_progress: "En curso", awaiting_confirmation: "Esperando confirmación",
  completed: "Completado", cancelled: "Cancelado", disputed: "En disputa", rejected: "Rechazado", in_review: "En revisión",
  draft: "Borrador", pending_payment: "Falta pagar", pending_approval: "A aprobar", open: "Abierto", paused: "Pausado",
  approved: "Aprobado", processing: "Procesando", held_escrow: "Retenido", refunded: "Devuelto", failed: "Fallido",
  confirmed_for_payout: "A pagar al trabajador", verified: "Verificado", pending_verification: "A verificar",
  escrow: "En garantía", released: "Liberado", held: "Retenido", partially_refunded: "Devuelto en parte", suspended: "Suspendida", expired: "Vencida",
};
export const estado = (s: string) => ESTADOS[s] || s;

export const enlace = "text-sky-600 hover:underline dark:text-sky-400";
