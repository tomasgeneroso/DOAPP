import cron from 'node-cron';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { conSistema } from '../db/contextoRls.js';
import { logEvento } from '../utils/auditLog.js';

/**
 * Cuando se termina el mes de PRO gratis del beneficio de lanzamiento (`otorgarContratosLibres`), la cuenta vuelve a su plan.
 *
 * La comisión de PRO se decide por el nivel guardado en la cuenta (`membership_tier`), no por la fecha de vencimiento: sin este barrido, quien recibió el mes
 * gratis quedaría con la comisión reducida de PRO para siempre. Solo toca cuentas con PRO vencido que recibieron el beneficio de lanzamiento y que NO tienen una
 * membresía paga activa (la tabla `memberships`): a quien paga PRO no se le toca nada.
 *
 * Se ejecuta cada hora. Cada cuenta que vuelve a su plan queda anotada en el registro de auditoría (qué valía y por qué).
 */
export async function vencerElProDeLanzamiento(ahora: Date = new Date()): Promise<number> {
  return conSistema(async () => {
    const filas = (await sequelize.query(
      `UPDATE users u
          SET membership_tier = 'free', has_membership = false
        WHERE u.launch_benefit_granted_at IS NOT NULL
          AND u.membership_tier = 'pro' AND u.has_membership = true
          AND u.membership_expires_at IS NOT NULL AND u.membership_expires_at <= CAST(:ahora AS timestamptz)
          AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.status = 'active')
      RETURNING u.id, u.membership_expires_at AS "vencioEl"`,
      { replacements: { ahora: ahora.toISOString() }, type: QueryTypes.SELECT },
    )) as Array<{ id: string; vencioEl: Date }>;

    for (const f of filas) {
      await logEvento({
        action: 'PRO_DE_LANZAMIENTO_VENCIDO',
        actor: 'cron:vencerElProDeLanzamiento',
        category: 'user',
        severity: 'low',
        description: `Se terminó el mes de PRO gratis de la cuenta ${f.id}: vuelve a su plan.`,
        targetModel: 'User',
        targetId: String(f.id),
        changes: [
          { field: 'membershipTier', oldValue: 'pro', newValue: 'free' },
          { field: 'hasMembership', oldValue: true, newValue: false },
        ],
        metadata: { vencioEl: new Date(f.vencioEl).toISOString() },
      });
    }
    return filas.length;
  });
}

export function startVencerElProDeLanzamientoJob() {
  cron.schedule('0 * * * *', async () => {
    try {
      const n = await vencerElProDeLanzamiento();
      if (n > 0) console.log(`🔄 [CRON] ${n} cuenta(s) terminaron su mes de PRO gratis y vuelven a su plan.`);
    } catch (e) {
      console.error('❌ [CRON] vencerElProDeLanzamiento:', (e as Error).message);
    }
  });
}
