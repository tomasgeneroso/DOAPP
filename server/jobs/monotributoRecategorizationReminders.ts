import cron from 'node-cron';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';

/**
 * Recordatorio de recategorización de monotributo (Centro Profesional · SUPER PRO).
 *
 * AFIP recategoriza en enero y julio según la facturación de los últimos 12 meses.
 * Corre diariamente a las 09:00 pero solo dispara el día 10 de enero y de julio,
 * avisando una vez por email + notificación in-app a los usuarios SUPER PRO
 * monotributistas para que revisen su facturación y recategoricen si corresponde.
 */
export function startMonotributoRecategorizationReminderJob() {
  cron.schedule('0 9 * * *', async () => {
    try {
      const now = new Date();
      const month = now.getMonth() + 1; // 1-12
      const day = now.getDate();
      // Solo el 10 de enero y el 10 de julio (período de recategorización)
      if (!((month === 1 || month === 7) && day === 10)) return;

      const users = await User.findAll({
        where: { membershipTier: 'super_pro', fiscalCondition: 'monotributo' },
        attributes: ['id', 'name', 'email'],
      });

      const title = 'Período de recategorización de monotributo';
      const message =
        'Es momento de revisar tu categoría: AFIP recategoriza en enero y julio según tu facturación de los últimos 12 meses. ' +
        'Mirá tu facturación en tu Centro Profesional y, si te pasaste de categoría, recategorizate antes del día 20.';

      let sent = 0;
      for (const u of users as any[]) {
        if (u.email) {
          await emailService
            .sendEmail({
              to: u.email,
              subject: `${title} · DOAPP`,
              html: `<p>Hola ${u.name || ''},</p><p>${message}</p><p>Recordá que esto es orientativo: ante dudas, consultá con tu contador.</p>`,
            })
            .catch((e) => console.error('[CRON] recat email error:', e?.message));
        }

        await Notification.create({
          recipientId: u.id,
          type: 'monotributo_recategorization',
          category: 'system',
          title,
          message,
          actionText: 'Ver Centro Profesional',
        } as any).catch((e) => console.error('[CRON] recat notification error:', e?.message));

        sent += 1;
      }

      if (sent > 0) console.log(`🔔 [CRON] Recordatorios de recategorización enviados: ${sent}`);
    } catch (error) {
      console.error('[CRON] monotributoRecategorizationReminders error:', error);
    }
  });

  console.log('✅ Monotributo recategorization reminder job scheduled (daily 09:00, fires Jan 10 / Jul 10)');
}
