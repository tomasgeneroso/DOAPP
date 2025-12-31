import cron from 'node-cron';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import fcmService from '../services/fcm.js';
import { Op } from 'sequelize';

/**
 * Cron job to send confirmation reminders when job end date has passed
 * Runs every 30 minutes
 * Sends email and push notification to both client and doer reminding them to confirm
 */
export function startConfirmationReminderJob() {
  // Run every 30 minutes: */30 * * * *
  cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('📧 [CRON] Checking for jobs needing confirmation reminders...');

      const now = new Date();

      // Find contracts where:
      // - Job end date has passed
      // - Contract is not completed, cancelled, or disputed
      // - Reminder hasn't been sent yet
      // - At least one party hasn't confirmed
      const contracts = await Contract.findAll({
        where: {
          status: { [Op.in]: ['accepted', 'in_progress', 'awaiting_confirmation'] },
          confirmationReminderSent: false,
          [Op.or]: [
            { clientConfirmed: false },
            { doerConfirmed: false },
          ],
        },
        include: [
          {
            model: Job,
            as: 'job',
            required: true,
            where: {
              endDate: { [Op.lte]: now },
              status: { [Op.in]: ['open', 'in_progress'] },
            },
            attributes: ['id', 'title', 'endDate'],
          },
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: User,
            as: 'doer',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (contracts.length === 0) {
        console.log('✅ [CRON] No contracts need confirmation reminders');
        return;
      }

      console.log(`📨 [CRON] Found ${contracts.length} contracts needing confirmation reminders`);

      let remindersSent = 0;

      for (const contract of contracts) {
        try {
          const job = contract.job as any;
          const client = contract.client as any;
          const doer = contract.doer as any;

          if (!job || !client || !doer) {
            console.warn(`⚠️ [CRON] Contract ${contract.id} missing required data, skipping`);
            continue;
          }

          const jobTitle = job.title;
          const contractId = contract.id;

          // Send to client if not confirmed
          if (!contract.clientConfirmed && client.email) {
            await emailService.sendConfirmationReminder(
              client.email,
              client.name,
              jobTitle,
              contractId,
              true // isClient
            );

            // Create notification for client
            await Notification.create({
              recipientId: client.id,
              type: 'confirm_remind',
              category: 'contract',
              title: '¡El trabajo ha terminado!',
              message: `El trabajo "${jobTitle}" ha finalizado. Por favor confirma que fue completado correctamente.`,
              relatedModel: 'Contract',
              relatedId: contractId,
              actionText: 'Confirmar trabajo',
              data: {
                contractId,
                jobId: job.id,
              },
              read: false,
            });

            // Send push notification
            await fcmService.sendToUser({
              userId: client.id,
              title: '¡Trabajo terminado!',
              body: `El trabajo "${jobTitle}" ha finalizado. Confirma para proceder con el pago.`,
              data: { type: 'confirmation_reminder', contractId },
            });

            console.log(`✅ [CRON] Confirmation reminder sent to client ${client.email} for contract ${contractId}`);
          }

          // Send to doer if not confirmed
          if (!contract.doerConfirmed && doer.email) {
            await emailService.sendConfirmationReminder(
              doer.email,
              doer.name,
              jobTitle,
              contractId,
              false // isClient
            );

            // Create notification for doer
            await Notification.create({
              recipientId: doer.id,
              type: 'confirm_remind',
              category: 'contract',
              title: '¡El trabajo ha terminado!',
              message: `El trabajo "${jobTitle}" ha finalizado. Por favor confirma para recibir tu pago.`,
              relatedModel: 'Contract',
              relatedId: contractId,
              actionText: 'Confirmar trabajo',
              data: {
                contractId,
                jobId: job.id,
              },
              read: false,
            });

            // Send push notification
            await fcmService.sendToUser({
              userId: doer.id,
              title: '¡Trabajo terminado!',
              body: `El trabajo "${jobTitle}" ha finalizado. Confirma para recibir tu pago.`,
              data: { type: 'confirmation_reminder', contractId },
            });

            console.log(`✅ [CRON] Confirmation reminder sent to doer ${doer.email} for contract ${contractId}`);
          }

          // Mark reminder as sent
          contract.confirmationReminderSent = true;
          await contract.save();
          remindersSent++;

        } catch (error) {
          console.error(`❌ [CRON] Error sending reminder for contract ${contract.id}:`, error);
        }
      }

      console.log(`🎯 [CRON] Confirmation reminders completed: ${remindersSent} contracts processed`);
    } catch (error) {
      console.error('❌ [CRON] Error in confirmation reminder job:', error);
    }
  });

  console.log('✅ [CRON] Confirmation reminder job started (every 30 minutes)');
}
