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
 * Quien paga: el TRABAJADOR. La comision sale de su lado, asi que el descuento
 * le sirve a quien tiene volumen. Un cliente contrata dos veces al año y nunca
 * amortizaria una cuota; un plomero hace veinte trabajos por mes y hace la
 * cuenta en diez segundos.
 *
 * El precio esta en euros por la misma razon que el resto: un precio fijado en
 * pesos se licua solo y nadie se acuerda de revisarlo.
 */

export const MEMBERSHIP_PRICES_EUR = {
  pro: 10,
} as const;

export type MembershipPlanKey = keyof typeof MEMBERSHIP_PRICES_EUR;

/** Comisiones por plan, en porcentaje. */
export const COMMISSION_RATES = {
  free: 10,
  pro: 5,
  /**
   * SUPER PRO ya no se vende. Se deja la tasa porque hay cuentas que lo tienen
   * asignado -- el owner, y cualquiera durante la beta -- y quitarlo del mapa
   * las dejaria sin tasa. Un plan que no se ofrece no es lo mismo que un plan
   * que no existe.
   */
  super_pro: 3,
} as const;

/**
 * A partir de cuantos trabajos por mes conviene el plan pago.
 *
 * Sale de la cuenta, no de una promesa de marketing: la cuota se amortiza
 * cuando el ahorro de comision la supera.
 *
 *   trabajos = precio / ((tasaFree - tasaPro) x ticket)
 *
 * Con PRO a 10 EUR, 5 puntos de ahorro y un ticket de ARS 40.000, son unos 7
 * trabajos mensuales. Sirve para poder decirselo al trabajador en la pantalla
 * en vez de que lo tenga que calcular.
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
