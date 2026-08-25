/**
 * Membership prices, denominated in euros.
 *
 * The platform charges in ARS, but the price is set in EUR and converted at the
 * moment of each payment. In an economy where the peso moves this much, a price
 * fixed in ARS silently becomes a different price every month; pinning it to a
 * currency keeps it the same price for everyone, always.
 *
 * A charge already made is never revisited: `Membership.priceARS` and
 * `exchangeRateAtPurchase` record what was actually charged and at what rate.
 * The next renewal converts again at the rate of that day — so a subscriber's
 * amount in pesos can change between months, and the euro amount never does.
 */

export const MEMBERSHIP_PRICES_EUR = {
  pro: 5,
  super_pro: 8,
} as const;

export type MembershipPlanKey = keyof typeof MEMBERSHIP_PRICES_EUR;

/** For copy that has to name the price without doing a conversion. */
export function formatEurPrice(plan: MembershipPlanKey): string {
  return `€${MEMBERSHIP_PRICES_EUR[plan]}`;
}
