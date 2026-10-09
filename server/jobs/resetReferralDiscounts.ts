import cron from 'node-cron';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import { isBetaPhase } from '../services/platformPhase.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR, MEMBERSHIP_PROMO_DAYS } from '../../shared/constants/membershipPricing.js';
import { Op } from 'sequelize';
import { limpiarCampos } from '../utils/limpiarCampos.js';

/**
 * Cron job para resetear los descuentos de comisión por referidos que expiraron.
 *
 * El descuento del 3% por completar 3 referidos dura solo 1 mes.
 * Después de ese mes, si el usuario no tiene suscripción PRO/SUPER PRO,
 * su comisión vuelve a la tasa estándar (COMMISSION_RATES.free).
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

      // Qué se le dice al usuario sale de la fase real: durante la beta no se cobra
      // comisión y la membresía no está a la venta (Términos 7.3 y 8.1). Decirle
      // "tu comisión ahora es del X%" o invitarlo a comprar sería falso.
      const enBeta = await isBetaPhase();
      const textoComision = enBeta
        ? `Durante la beta no se cobra comisión; al terminar rige la estándar, del ${COMMISSION_RATES.free}%, igual para todos los planes.`
        : `Tu comisión es la estándar, del ${COMMISSION_RATES.free}%, igual para todos los planes.`;
      const textoPro = enBeta
        ? ''
        : ` La membresía PRO (€${MEMBERSHIP_PRICES_EUR.pro}/mes) da visibilidad -promoción del perfil, insignia, prioridad en las búsquedas-, pero no cambia la comisión.`;
      const bloquePro = enBeta
        ? ''
        : `
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin: 20px 0; color: white;">
                  <h3 style="margin-top: 0;">¿Quieres más visibilidad?</h3>
                  <p>La membresía PRO (€${MEMBERSHIP_PRICES_EUR.pro}/mes, cobrada en pesos al cambio del día) incluye:</p>
                  <ul>
                    <li>Promoción de tu perfil (${MEMBERSHIP_PROMO_DAYS} días por mes)</li>
                    <li>Insignia de socio y prioridad en las búsquedas</li>
                    <li>Estadísticas de tu perfil</li>
                  </ul>
                  <p>No cambia la comisión: es la misma que en el plan gratuito.</p>
                  <a href="${process.env.CLIENT_URL}/settings?tab=membership"
                     style="display: inline-block; padding: 12px 24px; background-color: white; color: #667eea; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">
                    Ver planes
                  </a>
                </div>`;

      let resetCount = 0;

      for (const user of usersWithExpiredDiscount) {
        try {
          // Resetear a la tasa estándar
          user.currentCommissionRate = COMMISSION_RATES.free;
          user.hasReferralDiscount = false;
          limpiarCampos(user, 'referralDiscountExpiresAt');
          await user.save();

          // Crear notificación
          await Notification.create({
            recipientId: user.id,
            type: 'info',
            category: 'membership',
            title: 'Tu descuento de referidos ha expirado',
            message: `Tu descuento del 3% de comisión por referidos ha expirado después de 1 mes. ${textoComision}${textoPro}`,
            actionText: 'Ver planes',
            data: {
              previousRate: 3,
              newRate: COMMISSION_RATES.free,
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
                <p>${textoComision}</p>
                ${bloquePro}

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
