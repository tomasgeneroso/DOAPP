import { getEffectiveTier, isBetaPhase } from './platformPhase.js';

/**
 * Quién puede usar el Centro Profesional (el panel de finanzas y facturación del trabajador).
 *
 * Regla del dueño (2026-11-09): el Centro Profesional es parte de la membresía PRO, el único plan pago. Antes lo exigía un nivel interno «SUPER PRO» que ya no se
 * vende: en la beta lo veían todos, pero al terminar la beta nadie (salvo el dueño y cuentas heredadas) habría podido abrirlo.
 *
 * Puede: el dueño; todos durante la beta; y, después, quien tiene una membresía PRO vigente (activa y sin vencer). Las cuentas heredadas «super_pro» siguen
 * pudiendo mientras su membresía esté vigente.
 */
export interface CuentaParaElCentro {
  membershipTier?: string | null;
  adminRole?: string | null;
  hasMembership?: boolean | null;
  membershipExpiresAt?: Date | string | null;
}

export async function puedeUsarElCentroProfesional(cuenta: CuentaParaElCentro, ahora: Date = new Date()): Promise<boolean> {
  const nivel = await getEffectiveTier(cuenta.membershipTier, cuenta.adminRole);
  if (nivel === 'free') return false;
  if (cuenta.adminRole === 'owner' || (await isBetaPhase())) return true;
  if (!cuenta.hasMembership) return false;
  return !cuenta.membershipExpiresAt || new Date(cuenta.membershipExpiresAt).getTime() > ahora.getTime();
}

export const MENSAJE_CENTRO_PROFESIONAL = 'El Centro Profesional es parte de la membresía PRO.';
