import { calculateCommission, type CommissionResult } from './commissionService.js';
import { getEffectiveTier } from './platformPhase.js';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos).
 *
 * Un contrato libre de comisión se paga igual: el cliente abona el costo del trabajo y el del medio de pago (el procesamiento, con su
 * IVA); lo único que se exime es la COMISIÓN de DOAPP. Antes, con uno de estos contratos el servidor publicaba el trabajo sin cobrar
 * nada y lo marcaba como pagado: el costo del trabajo no se cobraba nunca.
 *
 * Hay dos cupos: los iniciales (cuentas FREE: `freeContractsRemaining`) y los mensuales de la membresía (PRO: 1, SUPER PRO: 2). Un cupo
 * se gasta UNA vez por trabajo (queda anotado en `job.commissionFreeApplied`), no cada vez que se abre la pantalla de pago.
 *
 * Donde la comisión ya es cero por otra razón (la beta, el plan familia, una invitación) no se gasta ningún cupo: no habría nada que eximir.
 */
export type CupoDeExencion = 'inicial' | 'mensual';

export interface ComisionDePublicacion {
  comision: CommissionResult;
  /** Qué cupo hay que gastar con este pago (null si no corresponde o ya se gastó para este trabajo). */
  gastar: CupoDeExencion | null;
}

const CUPO_MENSUAL: Record<string, number> = { pro: 1, super_pro: 2 };

export async function comisionDePublicacion(
  user: { id: unknown; membershipTier?: string | null; adminRole?: string | null; freeContractsRemaining?: number | null; proContractsUsedThisMonth?: number | null },
  job: { commissionFreeApplied?: boolean | null } | null,
  precio: number,
): Promise<ComisionDePublicacion> {
  const userId = String(user.id);
  const normal = await calculateCommission(userId, precio);

  // Ya se gastó un cupo para ESTE trabajo: sigue libre de comisión, sin gastar otro.
  if (job?.commissionFreeApplied) {
    return { comision: await calculateCommission(userId, precio, { isFreeContract: true }), gastar: null };
  }

  // Beta, plan familia o invitación: la comisión ya es cero y no hay nada que eximir.
  if (normal.commission === 0 && !normal.isFreeContract) return { comision: normal, gastar: null };

  // Cupo inicial: calculateCommission ya lo aplica (comisión 0, isFreeContract).
  if (normal.isFreeContract) return { comision: normal, gastar: 'inicial' };

  // Cupo mensual de la membresía.
  const tier = await getEffectiveTier(user.membershipTier ?? undefined, user.adminRole ?? undefined);
  const limite = CUPO_MENSUAL[String(tier)] ?? 0;
  if ((user.proContractsUsedThisMonth || 0) < limite) {
    return { comision: await calculateCommission(userId, precio, { isFreeContract: true }), gastar: 'mensual' };
  }

  return { comision: normal, gastar: null };
}

/** Gasta el cupo y lo anota en el trabajo. Llamar una sola vez por trabajo (la función de arriba ya devuelve null si se gastó). */
export async function gastarCupoDeExencion(user: any, job: any, cupo: CupoDeExencion): Promise<void> {
  if (cupo === 'inicial') user.freeContractsRemaining = Math.max(0, (user.freeContractsRemaining || 0) - 1);
  else user.proContractsUsedThisMonth = (user.proContractsUsedThisMonth || 0) + 1;
  job.commissionFreeApplied = true;
  await user.save();
  await job.save();
}
