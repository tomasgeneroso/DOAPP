import cron from 'node-cron';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Process a single expired job - cancel it and notify the owner
 * Can be called from cron or on-demand when user views their jobs
 */
async function processExpiredJob(job: Job, sendEmail: boolean = true): Promise<boolean> {
  try {
    const previousStatus = job.status;

    // Check if job had any proposals
    const proposalCount = await Proposal.count({
      where: { jobId: job.id }
    });

    const hasNoApplicants = proposalCount === 0;

    // Cancelar el trabajo
    job.status = 'cancelled';
    job.cancellationReason = hasNoApplicants
      ? 'Cancelado automáticamente: Ningún trabajador se postuló antes de la fecha programada.'
      : 'Cancelado automáticamente: La fecha del trabajo ya pasó sin que se completara la selección de trabajador.';
    job.cancelledAt = new Date();
    await job.save();

    // Fetch client info if not already loaded
    let client = job.client as any;
    if (!client) {
      client = await User.findByPk(job.clientId, {
        attributes: ['id', 'name', 'email']
      });
    }

    // Different notification based on whether there were applicants or not
    if (hasNoApplicants) {
      // No applicants - offer to reschedule
      await Notification.create({
        recipientId: job.clientId,
        type: 'job_no_applicants',
        category: 'jobs',
        title: 'Sin postulaciones',
        message: `Lo sentimos, ningún trabajador se postuló a tu trabajo "${job.title}". ¿Te gustaría reprogramarlo?`,
        relatedModel: 'Job',
        relatedId: job.id,
        actionText: 'Reprogramar',
        data: {
          jobId: job.id,
          previousStatus,
          noApplicants: true,
        },
        read: false,
      });

      // Send email for no applicants
      if (sendEmail && client?.email) {
        await emailService.sendEmail({
          to: client.email,
          subject: `Sin postulaciones para tu trabajo - ${job.title}`,
          html: `
            <h2>Lo sentimos, ningún trabajador se postuló</h2>
            <p>Hola ${client.name},</p>
            <p>Lamentablemente, ningún trabajador se postuló a tu trabajo <strong>"${job.title}"</strong> antes de la fecha programada.</p>

            <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0; color: #1e40af;"><strong>¿Qué puedes hacer?</strong></p>
              <ul style="margin: 8px 0 0 0; color: #1e40af; padding-left: 20px;">
                <li>Reprogramar el trabajo para nuevas fechas</li>
                <li>Revisar el presupuesto ofrecido</li>
                <li>Agregar más detalles a la descripción</li>
              </ul>
            </div>

            <p>
              <a href="${process.env.CLIENT_URL}/jobs/${job.id}/edit"
                 style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Reprogramar trabajo
              </a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
              Si tienes alguna pregunta, no dudes en contactar a nuestro equipo de soporte.
            </p>
          `,
        });
      }
    } else {
      // Had applicants but wasn't completed - regular cancellation
      await Notification.create({
        recipientId: job.clientId,
        type: 'job_auto_cancelled',
        category: 'jobs',
        title: 'Trabajo cancelado automáticamente',
        message: `Tu trabajo "${job.title}" fue cancelado automáticamente porque la fecha programada ya pasó. Puedes editar las fechas y volver a publicarlo.`,
        relatedModel: 'Job',
        relatedId: job.id,
        actionText: 'Editar y republicar',
        data: {
          jobId: job.id,
          previousStatus,
          noApplicants: false,
        },
        read: false,
      });

      // Enviar email
      if (sendEmail && client?.email) {
        await emailService.sendEmail({
          to: client.email,
          subject: `Trabajo cancelado automáticamente - ${job.title}`,
          html: `
            <h2>Tu trabajo fue cancelado automáticamente</h2>
            <p>Hola ${client.name},</p>
            <p>Tu trabajo <strong>"${job.title}"</strong> fue cancelado automáticamente porque la fecha programada ya pasó sin que se completara el proceso de selección.</p>

            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0; color: #92400e;"><strong>¿Qué puedes hacer?</strong></p>
              <p style="margin: 8px 0 0 0; color: #92400e;">Puedes editar las fechas de tu trabajo y volver a publicarlo cuando lo necesites.</p>
            </div>

            <p>
              <a href="${process.env.CLIENT_URL}/jobs/${job.id}/edit"
                 style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Editar y republicar
              </a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
              Si tienes alguna pregunta, no dudes en contactar a nuestro equipo de soporte.
            </p>
          `,
        });
      }
    }

    console.log(
      `✅ Auto-cancelado trabajo "${job.title}" (ID: ${job.id}) - Estado anterior: ${previousStatus}, Sin postulaciones: ${hasNoApplicants}`
    );
    return true;
  } catch (error) {
    console.error(`❌ Error auto-cancelando trabajo ${job.id}:`, error);
    return false;
  }
}

/**
 * Check and process expired jobs for a specific user
 * Called when user views their jobs list for immediate feedback
 */
export async function checkAndProcessUserExpiredJobs(userId: string): Promise<number> {
  try {
    const now = new Date();

    // Find expired jobs for this user
    // IMPORTANTE: No cancelar trabajos que ya tienen trabajador asignado (doerId)
    const expiredJobs = await Job.findAll({
      where: {
        clientId: userId,
        status: {
          [Op.in]: ['open', 'paused', 'pending_approval'],
        },
        endDate: {
          [Op.lt]: now,
        },
        // Solo cancelar si NO tiene trabajador asignado
        doerId: null,
      },
    });

    if (expiredJobs.length === 0) {
      return 0;
    }

    console.log(`⚠️ Found ${expiredJobs.length} expired jobs for user ${userId}`);

    let cancelledCount = 0;
    for (const job of expiredJobs) {
      const success = await processExpiredJob(job, true);
      if (success) cancelledCount++;
    }

    return cancelledCount;
  } catch (error) {
    console.error(`❌ Error checking expired jobs for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Check and process ALL expired jobs system-wide
 * Called by cron job
 */
async function checkAndProcessAllExpiredJobs(): Promise<void> {
  try {
    console.log('🔍 [CRON] Verificando trabajos expirados para auto-cancelación...');

    const now = new Date();

    // Buscar trabajos abiertos o pausados cuya fecha de FIN ya pasó
    // IMPORTANTE: No cancelar trabajos que ya tienen trabajador asignado (doerId)
    const expiredJobs = await Job.findAll({
      where: {
        status: {
          [Op.in]: ['open', 'paused', 'pending_approval'],
        },
        endDate: {
          [Op.lt]: now,
        },
        // Solo cancelar si NO tiene trabajador asignado
        doerId: null,
      },
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    if (expiredJobs.length === 0) {
      console.log('✅ [CRON] No hay trabajos expirados para cancelar');
      return;
    }

    console.log(`⚠️  [CRON] Encontrados ${expiredJobs.length} trabajos expirados para auto-cancelar`);

    let cancelledCount = 0;
    for (const job of expiredJobs) {
      const success = await processExpiredJob(job, true);
      if (success) cancelledCount++;
    }

    console.log(
      `🎯 [CRON] Proceso completado: ${cancelledCount}/${expiredJobs.length} trabajos auto-cancelados`
    );
  } catch (error) {
    console.error('❌ [CRON] Error en job de auto-cancelación:', error);
  }
}

/**
 * Auto-completes in_progress jobs past their end date where the client is absent.
 * Grace period: 2 hours after endDate. If client still hasn't confirmed, moves contracts to
 * awaiting_confirmation so the existing 2h auto-confirm cron can release escrow to workers.
 */
async function autoCompleteExpiredInProgressJobs(): Promise<void> {
  try {
    const now = new Date();
    const graceCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago

    const expiredJobs = await Job.findAll({
      where: {
        status: 'in_progress',
        endDate: { [Op.lt]: graceCutoff },
      },
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (expiredJobs.length === 0) return;

    console.log(`⚠️  [CRON] ${expiredJobs.length} trabajos en progreso vencidos para auto-completar`);

    for (const job of expiredJobs) {
      try {
        const contracts = await Contract.findAll({
          where: {
            jobId: job.id,
            status: { [Op.in]: ['accepted', 'in_progress'] },
          },
          include: [
            { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
          ],
        });

        if (contracts.length === 0) continue;

        const client = job.client as any;

        for (const contract of contracts) {
          const doer = contract.doer as any;

          // Move to awaiting_confirmation so the existing auto-confirm cron takes over
          await contract.update({
            status: 'awaiting_confirmation',
            awaitingConfirmationAt: contract.awaitingConfirmationAt || new Date(),
            doerConfirmed: true,
          });

          // Notify worker
          await Notification.create({
            recipientId: contract.doerId,
            type: 'success',
            category: 'contract',
            title: 'Pago en proceso',
            message: `El trabajo "${job.title}" venció. El pago se liberará automáticamente dado que el cliente no respondió a tiempo.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            actionText: 'Ver contrato',
            data: { jobId: job.id, contractId: contract.id },
            read: false,
          });

          if (doer?.email) {
            await emailService.sendEmail({
              to: doer.email,
              subject: `Pago en proceso - ${job.title}`,
              html: `
                <h2>Tu pago está siendo procesado</h2>
                <p>Hola ${doer.name},</p>
                <p>El trabajo <strong>"${job.title}"</strong> venció y el cliente no respondió a tiempo. Tu pago será liberado automáticamente en breve.</p>
                <p>
                  <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                     style="display:inline-block;padding:12px 24px;background-color:#22c55e;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
                    Ver contrato
                  </a>
                </p>
              `,
            });
          }
        }

        // Notify client
        if (client) {
          await Notification.create({
            recipientId: job.clientId,
            type: 'warning',
            category: 'jobs',
            title: 'Pago liberado automáticamente',
            message: `El trabajo "${job.title}" venció sin tu confirmación. El pago fue liberado a los trabajadores según los Términos y Condiciones.`,
            relatedModel: 'Job',
            relatedId: job.id,
            actionText: 'Ver trabajo',
            data: { jobId: job.id },
            read: false,
          });

          if (client.email) {
            await emailService.sendEmail({
              to: client.email,
              subject: `Pago liberado automáticamente - ${job.title}`,
              html: `
                <h2>Pago liberado automáticamente</h2>
                <p>Hola ${client.name},</p>
                <p>El trabajo <strong>"${job.title}"</strong> venció sin recibir tu confirmación. Según nuestros Términos y Condiciones, cuando un cliente no confirma la finalización del trabajo en el plazo establecido, el pago se libera automáticamente a los trabajadores y las comisiones de la plataforma se retienen.</p>
                <p>Si tenés alguna duda, podés abrir una disputa desde el contrato.</p>
                <p>
                  <a href="${process.env.CLIENT_URL}/jobs/${job.id}"
                     style="display:inline-block;padding:12px 24px;background-color:#0ea5e9;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
                    Ver trabajo
                  </a>
                </p>
              `,
            });
          }
        }

        console.log(`✅ [CRON] Trabajo "${job.title}" (${job.id}) movido a awaiting_confirmation por ausencia del cliente`);
      } catch (err) {
        console.error(`❌ [CRON] Error procesando trabajo vencido ${job.id}:`, err);
      }
    }
  } catch (error) {
    console.error('❌ [CRON] Error en auto-complete de trabajos vencidos:', error);
  }
}

/**
 * Cron job para auto-cancelar trabajos cuya fecha de inicio y fin ya pasaron
 * Se ejecuta cada 5 minutos para verificar trabajos expirados (más responsivo que cada hora)
 */
export function startAutoCancelExpiredJobsJob() {
  // Ejecutar cada 5 minutos: */5 * * * * para respuesta más rápida
  cron.schedule('*/5 * * * *', async () => {
    await checkAndProcessAllExpiredJobs();
  });

  // Auto-complete in_progress jobs past end date (client absent grace period: 2h)
  // Runs every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await autoCompleteExpiredInProgressJobs();
  });

  console.log('✅ [CRON] Job de auto-cancelación de trabajos expirados iniciado (cada 5 minutos)');
  console.log('✅ [CRON] Job de auto-complete de trabajos vencidos iniciado (cada 30 minutos)');
}
