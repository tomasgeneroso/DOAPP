import { literal } from 'sequelize';

/**
 * Prioridad de soporte para quien tiene la membresía PRO (T&C 8.1): en el panel de administración sus tickets y reclamos van primero y se ven marcados.
 *
 * «Premium» = membresía PRO (o la SUPER PRO heredada) vigente: `has_membership` y no vencida. En la beta nadie la compró, así que hoy solo la tienen las cuentas a
 * las que el equipo se la dio; cuando se venda, esto ordena solo.
 */
const PREMIUM = (alias: string) =>
  `("${alias}"."membership_tier" IN ('pro', 'super_pro') AND "${alias}"."has_membership" = true AND ("${alias}"."membership_expires_at" IS NULL OR "${alias}"."membership_expires_at" > NOW()))`;

/** Para `order`: primero los tickets/reclamos de cuentas premium (cualquiera de los `alias` de usuario incluidos). */
export const premiumPrimero = (...alias: string[]) => [literal(`CASE WHEN ${alias.map(PREMIUM).join(' OR ')} THEN 0 ELSE 1 END`), 'ASC'] as const;

/** ¿Esta cuenta tiene la membresía vigente? (para marcar la fila en la respuesta). */
export function esPremium(u: { membershipTier?: string | null; hasMembership?: boolean | null; membershipExpiresAt?: Date | string | null } | null | undefined): boolean {
  if (!u) return false;
  if (!['pro', 'super_pro'].includes(String(u.membershipTier))) return false;
  if (u.hasMembership !== true) return false;
  return !u.membershipExpiresAt || new Date(u.membershipExpiresAt).getTime() > Date.now();
}

/** Los atributos que hay que traer del usuario para saberlo. */
export const ATRIBUTOS_DE_MEMBRESIA = ['membershipTier', 'hasMembership', 'membershipExpiresAt'];
