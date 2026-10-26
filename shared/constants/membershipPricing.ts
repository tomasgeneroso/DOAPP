/**
 * Planes y comisiones.
 *
 * Un solo plan pago, y a proposito. Con PRO a 5 EUR y SUPER PRO a 8, los
 * umbrales de conveniencia daban 5,6 y 5,1 trabajos por mes -- practicamente el
 * mismo -- asi que nadie iba a comprar el PRO: todos se pasaban al SUPER PRO por
 * 3 EUR mas. Dos planes pagos necesitan dos segmentos de volumen reales, y
 * todavia no sabemos si existen. El segundo se agrega cuando aparezcan
 * trabajadores de 20+ trabajos pidiendo mas descuento.
 *
 * Que da PRO (regla del dueño, 2026-10-25): 1 contrato libre de comision por mes (sin acumular), comision reducida en los demas contratos, estadisticas,
 * promocion del perfil, visibilidad y prioridad en soporte. Ver `shared/constants/beneficiosPro.ts`, que es la unica lista que repiten el T&C 8.1, las
 * pantallas y los correos.
 *
 * El precio esta en euros por la misma razon que el resto: un precio fijado en
 * pesos se licua solo y nadie se acuerda de revisarlo.
 */

export const MEMBERSHIP_PRICES_EUR = {
  pro: 7,
} as const;

/**
 * Dias de promocion que incluye el plan.
 *
 * Menos que la cuota, y a proposito. Si el plan incluyera tantos dias como
 * cuesta -- EUR 10 con 10 dias, por ejemplo -- el ingreso nuevo seria cero:
 * al trabajador que igual iba a comprar esos dias se le cobraria lo mismo y
 * encima se le regalarian insignia, prioridad y estadisticas. La membresia se
 * comeria su propio producto.
 *
 * Con 3 dias sobre una cuota de 7, lo que se paga de mas son EUR 4 por los
 * beneficios que no son promocion, y el que quiere mas dias los sigue
 * comprando sueltos.
 */
export const MEMBERSHIP_PROMO_DAYS = 3;

export type MembershipPlanKey = keyof typeof MEMBERSHIP_PRICES_EUR;

/**
 * La comision, por plan. La paga el CLIENTE (T&C 7.3): el plan gratuito paga 10% y quien tiene PRO paga 3% en los contratos que contrata (ademas del contrato
 * libre de comision de cada mes). Las cuentas SUPER PRO que quedaron de antes (ya no se vende) tienen lo mismo que PRO.
 *
 * Antes valian lo mismo las tres: se habia decidido que la membresia vendia solo visibilidad. El dueño lo cambio el 2026-10-25. Si la tasa vuelve a cambiar,
 * se cambia aca y el resto del sistema (cobro, T&C, pantallas) se entera solo.
 */
export const COMMISSION_RATES = {
  free: 10,
  pro: 3,
  super_pro: 3,
} as const;

/**
 * A partir de cuantos trabajos por mes se amortizaria el plan por comision.
 *
 * Es el ahorro de comision de PRO (la diferencia entre la tasa gratuita y la de PRO) contra el precio de la cuota; no cuenta el contrato libre de cada mes
 * ni la visibilidad, que tambien son parte de lo que se paga.
 */
export function breakEvenJobsPerMonth(
  eurArs: number,
  averageTicketArs: number,
  plan: MembershipPlanKey = 'pro',
): number {
  const ahorro = (COMMISSION_RATES.free - COMMISSION_RATES[plan]) / 100;
  if (ahorro <= 0 || averageTicketArs <= 0) return 0;
  return Math.ceil((MEMBERSHIP_PRICES_EUR[plan] * eurArs) / (ahorro * averageTicketArs));
}

/** Para textos que tienen que nombrar el precio sin hacer la conversion. */
export function formatEurPrice(plan: MembershipPlanKey): string {
  return `€${MEMBERSHIP_PRICES_EUR[plan]}`;
}
