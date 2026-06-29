import cron from 'node-cron';
import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';

/**
 * Recordatorios de vencimiento de matrícula (Centro Profesional · SUPER PRO).
 * Corre diariamente a las 09:00. Avisa por email + notificación in-app cuando la
 * matrícula vence en 30 / 15 / 7 / 1 días, o cuando acaba de vencer.
 * El match por día exacto evita reenvíos (a lo sumo un aviso por umbral).
 */
const THRESHOLDS = [30, 15, 7, 1];

export function startLicenseExpiryReminderJob() {
  cron.schedule('0 9 * * *', async () => {
    try {
      const now = new Date();
      const in31 = new Date(now.getTime() + 31 * 86400000);

      const users = await User.findAll({
        where: { licenseExpiresAt: { [Op.ne]: null as any, [Op.lte]: in31 } },
        attributes: ['id', 'name', 'email', 'licenseExpiresAt'],
      });

      let sent = 0;
      for (const u of users as any[]) {
        const exp = new Date(u.licenseExpiresAt);
        const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);

        let title = '';
        let message = '';
        if (THRESHOLDS.includes(days)) {
          title = 'Tu matrícula está por vencer';
          message = `Tu matrícula vence en ${days} día(s). Acordate de renovarla para seguir habilitado.`;
        } else if (days === 0 || days === -1) {
          title = 'Tu matrícula venció';
          message = 'Tu matrícula venció. Renovala para seguir trabajando habilitado.';
        } else {
          continue;
        }

        if (u.email) {
          await emailService.sendEmail({
            to: u.email,
            subject: `${title} · DOAPP`,
            html: `<p>Hola ${u.name || ''},</p><p>${message}</p><p>Podés actualizar tu matrícula desde tu <strong>Centro Profesional</strong> en DOAPP.</p>`,
          }).catch((e) => console.error('[CRON] license email error:', e?.message));
        }

        await Notification.create({
          recipientId: u.id,
          type: 'license_reminder',
          category: 'system',
          title,
          message,
          actionText: 'Ver Centro Profesional',
        } as any).catch((e) => console.error('[CRON] license notification error:', e?.message));

        sent += 1;
      }

      if (sent > 0) console.log(`🔔 [CRON] Recordatorios de matrícula enviados: ${sent}`);
    } catch (error) {
      console.error('[CRON] licenseExpiryReminders error:', error);
    }
  });

  console.log('✅ License expiry reminder job scheduled (daily 09:00)');
}
