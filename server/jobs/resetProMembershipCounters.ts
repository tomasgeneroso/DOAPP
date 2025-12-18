import cron from 'node-cron';
import { User } from '../models/sql/User.model.js';

/**
 * Cron job para resetear contadores mensuales de membresías PRO
 * Se ejecuta el día 1 de cada mes a las 00:00
 */
export function startResetProMembershipCountersJob() {
  // Ejecutar el día 1 de cada mes a las 00:00: 0 0 1 * *
  cron.schedule('0 0 1 * *', async () => {
    try {
      console.log('🔄 [CRON] Reseteando contadores mensuales de membresías PRO...');

      const now = new Date();
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Buscar usuarios PRO activos con membresía
      const proUsers = await User.findAll({ where: {
        membershipTier: 'pro',
        hasMembership: true,
      } });

      if (proUsers.length === 0) {
        console.log('✅ [CRON] No hay usuarios PRO para resetear');
        return;
      }

      console.log(`🔍 [CRON] Encontrados ${proUsers.length} usuarios PRO activos`);

      let resetCount = 0;
      let bonusAwardedCount = 0;

      for (const user of proUsers) {
        try {
          const u = user as any;
          // Verificar si completó 3 contratos en el mes pasado y otorgar bonus
          if ((u.proContractsUsedThisMonth || 0) >= 3 && !u.earnedBonusContract) {
            u.earnedBonusContract = true;
            u.freeContractsRemaining = (u.freeContractsRemaining || 0) + 1; // Agregar 1 contrato gratis bonus
            bonusAwardedCount++;
            console.log(`🎁 [CRON] Usuario ${user.email} ganó contrato bonus por completar 3 contratos`);
          }

          // Resetear contadores mensuales
          u.proContractsUsedThisMonth = 0;
          u.freeContractsRemaining = 3; // Resetear a 3 contratos gratis

          await user.save();
          resetCount++;

          console.log(`✅ [CRON] Reseteado usuario ${user.email} (PRO)`);
        } catch (error) {
          console.error(`❌ [CRON] Error reseteando usuario ${user.id}:`, error);
        }
      }

      console.log(
        `🎯 [CRON] Proceso completado: ${resetCount}/${proUsers.length} usuarios reseteados, ${bonusAwardedCount} bonos otorgados`
      );
    } catch (error) {
      console.error('❌ [CRON] Error en job de reset PRO:', error);
    }
  });

  console.log('✅ [CRON] Job de reset PRO memberships iniciado (día 1 de cada mes a las 00:00)');
}
