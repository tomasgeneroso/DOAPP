import cron from 'node-cron';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Cron job para suspender trabajos con fecha final flexible (endDateFlexible = true)
 * que no tienen fecha de fin definida 24 horas antes del inicio.
 *
 * También reactiva trabajos suspendidos que ya tienen fecha de fin definida.
 *
 * Se ejecuta cada hora.
 */
export function startSuspendFlexibleEndDateJob() {
  // Ejecutar cada hora: 0 * * * *
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando trabajos con fecha final flexible...');

      const now = new Date();
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // 1. SUSPENDER: Buscar trabajos con endDateFlexible=true que comienzan en las próximas 24 horas
      // y que aún no tienen fecha de fin definida
      const jobsToSuspend = await Job.findAll({
        where: {
          status: 'open',
          endDateFlexible: true,
          endDate: null, // No tiene fecha de fin definida
          startDate: {
            [Op.lte]: twentyFourHoursFromNow,
            [Op.gt]: now,
          },
        },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (jobsToSuspend.length > 0) {
        console.log(`⚠️  [CRON] Encontrados ${jobsToSuspend.length} trabajos para suspender por falta de fecha final`);

        for (const job of jobsToSuspend) {
          try {
            // Cambiar estado a suspended
            job.status = 'suspended';
            await job.save();

            const client = job.client as any;

            // Notificación al cliente
            await Notification.create({
              recipientId: job.clientId,
              type: 'warning',
              category: 'jobs',
              title: 'Trabajo suspendido por falta de fecha final',
              message: `Tu trabajo "${job.title}" ha sido suspendido porque no definiste una fecha de finalización. Por favor, edita el trabajo y agrega una fecha de fin para reactivarlo.`,
              relatedModel: 'Job',
              relatedId: job.id,
              actionText: 'Editar trabajo',
              data: {
                jobId: job.id,
                reason: 'missing_end_date',
              },
              read: false,
            });

            // Email al cliente
            if (client?.email) {
              await emailService.sendEmail({
                to: client.email,
                subject: `⚠️ Trabajo suspendido: ${job.title}`,
                html: `
                  <h2>Tu trabajo ha sido suspendido</h2>
                  <p>El trabajo <strong>"${job.title}"</strong> ha sido suspendido porque no definiste una fecha de finalización antes de las 24 horas previas al inicio.</p>
                  <p>Para reactivar tu trabajo, edítalo y define una fecha de fin.</p>
                  <p>
                    <a href="${process.env.CLIENT_URL}/jobs/${job.id}/edit"
                       style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                      Editar trabajo
                    </a>
                  </p>
                  <p style="color: #666; font-size: 12px;">
                    Una vez que definas la fecha de finalización, el trabajo se reactivará automáticamente.
                  </p>
                `,
              });
            }

            console.log(`⏸️  [CRON] Trabajo "${job.title}" (${job.id}) suspendido por falta de fecha final`);
          } catch (error) {
            console.error(`❌ [CRON] Error suspendiendo trabajo ${job.id}:`, error);
          }
        }
      } else {
        console.log('✅ [CRON] No hay trabajos para suspender por fecha final flexible');
      }

      // 2. REACTIVAR: Buscar trabajos suspendidos que ya tienen fecha de fin definida
      const jobsToReactivate = await Job.findAll({
        where: {
          status: 'suspended',
          endDateFlexible: false,
          endDate: { [Op.ne]: null },
          startDate: { [Op.gt]: now }, // Solo si la fecha de inicio aún no pasó
        },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (jobsToReactivate.length > 0) {
        console.log(`🔄 [CRON] Encontrados ${jobsToReactivate.length} trabajos para reactivar`);

        for (const job of jobsToReactivate) {
          try {
            // Verificar que la fecha de fin sea válida (después de la fecha de inicio)
            const jobEndDate = job.endDate ? new Date(job.endDate) : null;
            const jobStartDate = job.startDate ? new Date(job.startDate) : null;

            if (!jobEndDate || !jobStartDate || jobEndDate <= jobStartDate) {
              console.log(`⚠️  [CRON] Trabajo ${job.id} tiene fechas inválidas, no se reactiva`);
              continue;
            }

            // Reactivar el trabajo
            job.status = 'open';
            job.endDateFlexible = false;
            await job.save();

            const client = job.client as any;

            // Notificación al cliente
            await Notification.create({
              recipientId: job.clientId,
              type: 'success',
              category: 'jobs',
              title: '¡Trabajo reactivado!',
              message: `Tu trabajo "${job.title}" ha sido reactivado automáticamente ahora que tiene una fecha de finalización definida.`,
              relatedModel: 'Job',
              relatedId: job.id,
              actionText: 'Ver trabajo',
              data: {
                jobId: job.id,
              },
              read: false,
            });

            // Email al cliente
            if (client?.email) {
              await emailService.sendEmail({
                to: client.email,
                subject: `✅ Trabajo reactivado: ${job.title}`,
                html: `
                  <h2>¡Tu trabajo ha sido reactivado!</h2>
                  <p>El trabajo <strong>"${job.title}"</strong> ha sido reactivado automáticamente ahora que definiste una fecha de finalización.</p>
                  <p>Los trabajadores ya pueden volver a postularse.</p>
                  <p>
                    <a href="${process.env.CLIENT_URL}/jobs/${job.id}"
                       style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                      Ver trabajo
                    </a>
                  </p>
                `,
              });
            }

            console.log(`▶️  [CRON] Trabajo "${job.title}" (${job.id}) reactivado`);
          } catch (error) {
            console.error(`❌ [CRON] Error reactivando trabajo ${job.id}:`, error);
          }
        }
      } else {
        console.log('✅ [CRON] No hay trabajos suspendidos para reactivar');
      }

      console.log(`🎯 [CRON] Proceso de fecha flexible completado: ${jobsToSuspend.length} suspendidos, ${jobsToReactivate.length} reactivados`);
    } catch (error) {
      console.error('❌ [CRON] Error en job de fecha flexible:', error);
    }
  });

  console.log('✅ [CRON] Job de suspensión de trabajos con fecha flexible iniciado (cada hora)');
}
