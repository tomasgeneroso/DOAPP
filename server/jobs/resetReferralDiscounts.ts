import cron from 'node-cron';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Cron job para resetear los descuentos de comisión por referidos que expiraron.
 *
 * El descuento del 3% por completar 3 referidos dura solo 1 mes.
 * Después de ese mes, si el usuario no tiene suscripción PRO/SUPER PRO,
 * su comisión vuelve al 8% (free).
 *
 * Se ejecuta diariamente a las 00:00.
 */
export function startResetReferralDiscountsJob() {
  // Ejecutar todos los días a medianoche: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando descuentos de referidos expirados...');

      const now = new Date();

      // Buscar usuarios con descuento de referido que haya expirado
      const usersWithExpiredDiscount = await User.findAll({
        where: {
          hasReferralDiscount: true,
          referralDiscountExpiresAt: {
            [Op.lt]: now, // Fecha de expiración pasó
          },
          membershipTier: 'free', // Solo usuarios free (PRO/SUPER PRO mantienen su comisión)
        },
      });

      if (usersWithExpiredDiscount.length === 0) {
        console.log('✅ [CRON] No hay descuentos de referidos expirados');
        return;
      }

      console.log(`⚠️  [CRON] Encontrados ${usersWithExpiredDiscount.length} usuarios con descuento expirado`);

      let resetCount = 0;

      for (const user of usersWithExpiredDiscount) {
        try {
          // Resetear comisión al 8% (free)
          user.currentCommissionRate = 8.0;
          user.hasReferralDiscount = false;
          user.referralDiscountExpiresAt = undefined;
          await user.save();

          // Crear notificación
          await Notification.create({
            recipientId: user.id,
            type: 'info',
            category: 'membership',
            title: 'Tu descuento de referidos ha expirado',
            message: 'Tu descuento del 3% de comisión por referidos ha expirado después de 1 mes. Tu comisión ahora es del 8%. ¡Suscríbete a PRO o SUPER PRO para mantener comisiones reducidas!',
            actionText: 'Ver planes',
            data: {
              previousRate: 3,
              newRate: 8,
              reason: 'referral_discount_expired',
            },
            read: false,
          });

          // Enviar email
          if (user.email) {
            await emailService.sendEmail({
              to: user.email,
              subject: 'Tu descuento de referidos ha expirado - Doers',
              html: `
                <h2>Hola ${user.name},</h2>
                <p>Tu descuento del <strong>3%</strong> de comisión que ganaste por referir a 3 amigos ha expirado después de 1 mes.</p>
                <p>A partir de ahora, tu comisión por contratos es del <strong>8%</strong> (tarifa estándar).</p>

                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin: 20px 0; color: white;">
                  <h3 style="margin-top: 0;">¿Quieres mantener comisiones reducidas?</h3>
                  <p>Suscríbete a uno de nuestros planes:</p>
                  <ul>
                    <li><strong>PRO (€5.99/mes)</strong>: 3% de comisión</li>
                    <li><strong>SUPER PRO (€8.99/mes)</strong>: 2% de comisión</li>
                  </ul>
                  <a href="${process.env.CLIENT_URL}/settings?tab=membership"
                     style="display: inline-block; padding: 12px 24px; background-color: white; color: #667eea; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">
                    Ver planes
                  </a>
                </div>

                <p>¡Gracias por ser parte de Doers!</p>
              `,
            });
          }

          resetCount++;
          console.log(`🔄 [CRON] Reseteado descuento para usuario ${user.name} (${user.email})`);
        } catch (error) {
          console.error(`❌ [CRON] Error reseteando descuento para usuario ${user.id}:`, error);
        }
      }

      console.log(`🎯 [CRON] Proceso completado: ${resetCount}/${usersWithExpiredDiscount.length} descuentos reseteados`);
    } catch (error) {
      console.error('❌ [CRON] Error en job de reset de descuentos:', error);
    }
  });

  console.log('✅ [CRON] Job de reset de descuentos de referidos iniciado (diario a medianoche)');
}
