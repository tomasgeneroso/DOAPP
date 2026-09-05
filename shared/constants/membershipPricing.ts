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
 * La comision es 10%, siempre.
 *
 * La paga el cliente y el cliente no tiene membresia, asi que no hay plan
 * que la modifique. Las tasas por plan siguen declaradas porque el calculo
 * las lee, pero hoy todas valen lo mismo a proposito: si en algun momento
 * la membresia pasa a descontar comision, se cambian aca y el resto del
 * sistema se entera solo.
 *
 * El valor de la membresia es la visibilidad -- promocion del perfil,
 * insignia, prioridad en las busquedas, estadisticas -- no un descuento.
 * Es lo unico que se puede vender de forma coherente mientras quien paga la
 * comision sea el otro lado.
 */
export const COMMISSION_RATES = {
  free: 10,
  pro: 10,
  super_pro: 10,
} as const;

/**
 * A partir de cuantos trabajos por mes se amortizaria el plan por comision.
 *
 * Hoy devuelve 0 siempre, porque todas las tasas son iguales y no hay ahorro
 * de comision que amortizar. Se deja escrita la cuenta para el dia que la
 * membresia si descuente: entonces empieza a dar un numero real sin tener
 * que reescribirla.
 *
 * Mientras tanto, la pantalla no deberia prometer un punto de equilibrio que
 * no existe: el plan se vende por visibilidad.
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
