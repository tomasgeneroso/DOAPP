import cron from 'node-cron';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import { isBetaPhase } from '../services/platformPhase.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR, MEMBERSHIP_PROMO_DAYS } from '../../shared/constants/membershipPricing.js';
import { beneficiosPro } from '../../shared/constants/beneficiosPro.js';
import { Op } from 'sequelize';
import { limpiarCampos, valoresAnteriores } from '../utils/limpiarCampos.js';
import { logEvento } from '../utils/auditLog.js';

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
        ? `Durante la beta no se cobra comisión; al terminar rige la estándar, del ${COMMISSION_RATES.free}% (${COMMISSION_RATES.pro}% con la membresía PRO).`
        : `Tu comisión es la estándar, del ${COMMISSION_RATES.free}% (${COMMISSION_RATES.pro}% con la membresía PRO).`;
      const textoPro = enBeta
        ? ''
        : ` La membresía PRO (€${MEMBERSHIP_PRICES_EUR.pro}/mes) baja la comisión al ${COMMISSION_RATES.pro}% y suma un contrato libre de comisión por mes, promoción del perfil y prioridad en las búsquedas.`;
      const bloquePro = enBeta
        ? ''
        : `
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin: 20px 0; color: white;">
                  <h3 style="margin-top: 0;">¿Querés pagar menos comisión y tener más visibilidad?</h3>
                  <p>La membresía PRO (€${MEMBERSHIP_PRICES_EUR.pro}/mes, cobrada en pesos al cambio del día) incluye:</p>
                  <ul>
                    ${beneficiosPro().map((b) => `<li>${b}</li>`).join('\n                    ')}
                  </ul>
                  <a href="${process.env.CLIENT_URL}/settings?tab=membership"
                     style="display: inline-block; padding: 12px 24px; background-color: white; color: #667eea; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">
                    Ver planes
                  </a>
                </div>`;

      let resetCount = 0;

      for (const user of usersWithExpiredDiscount) {
        try {
          // Lo que se va a vaciar se anota antes: cuándo vencía y qué tasa tenía.
          const vencia = valoresAnteriores(user, 'referralDiscountExpiresAt');
          const tasaAnterior = user.currentCommissionRate;

          // Resetear a la tasa estándar
          user.currentCommissionRate = COMMISSION_RATES.free;
          user.hasReferralDiscount = false;
          limpiarCampos(user, 'referralDiscountExpiresAt');
          await user.save();

          await logEvento({
            action: 'REFERRAL_DISCOUNT_EXPIRED',
            actor: 'cron:resetReferralDiscounts',
            category: 'user',
            severity: 'low',
            description: `Venció el descuento de referidos de ${user.email}: la tasa vuelve de ${tasaAnterior}% a ${COMMISSION_RATES.free}%`,
            targetModel: 'User',
            targetId: String(user.id),
            targetIdentifier: user.email,
            changes: [
              { field: 'hasReferralDiscount', oldValue: true, newValue: false },
              { field: 'currentCommissionRate', oldValue: tasaAnterior, newValue: COMMISSION_RATES.free },
              { field: 'referralDiscountExpiresAt', oldValue: vencia.referralDiscountExpiresAt, newValue: null },
            ],
            metadata: { venciaEl: vencia.referralDiscountExpiresAt, tasaAnterior, tasaNueva: COMMISSION_RATES.free },
          });

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
