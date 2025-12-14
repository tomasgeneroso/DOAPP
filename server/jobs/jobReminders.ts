import cron from 'node-cron';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Cron job para enviar recordatorios antes del inicio del trabajo
 * - 12 horas antes
 * - 6 horas antes
 * - 2 horas antes
 * Se ejecuta cada 30 minutos
 */
export function startJobReminderJob() {
  // Ejecutar cada 30 minutos: */30 * * * *
  cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('🔔 [CRON] Verificando trabajos para enviar recordatorios...');

      const now = new Date();

      // Buscar trabajos que necesitan recordatorios
      // Solo trabajos con doer asignado (selectedWorkers o doerId) y status open o in_progress
      const jobsNeedingReminders = await Job.findAll({
        where: {
          status: { [Op.in]: ['open', 'in_progress'] },
          startDate: { [Op.gt]: now },
          // Al menos uno de los recordatorios no enviado
          [Op.or]: [
            { reminder12hSent: false },
            { reminder6hSent: false },
            { reminder2hSent: false },
          ],
        },
        include: [
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

      // Filtrar solo trabajos con workers asignados (doerId o selectedWorkers no vacío)
      const jobsWithWorkers = jobsNeedingReminders.filter(job => {
        const hasDoer = job.doerId !== null;
        const hasSelectedWorkers = job.selectedWorkers && job.selectedWorkers.length > 0;
        return hasDoer || hasSelectedWorkers;
      });

      if (jobsWithWorkers.length === 0) {
        console.log('✅ [CRON] No hay trabajos con trabajadores asignados que requieran recordatorios');
        return;
      }

      console.log(`📨 [CRON] Encontrados ${jobsWithWorkers.length} trabajos para verificar recordatorios`);

      let remindersSent = 0;

      for (const job of jobsWithWorkers) {
        try {
          const startDate = new Date(job.startDate);
          const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          const client = job.client as any;

          // Obtener todos los trabajadores (doerId legacy + selectedWorkers)
          const workerIds: string[] = [];
          if (job.doerId) workerIds.push(job.doerId);
          if (job.selectedWorkers && job.selectedWorkers.length > 0) {
            for (const wId of job.selectedWorkers) {
              if (!workerIds.includes(wId)) workerIds.push(wId);
            }
          }

          // Obtener datos de los trabajadores
          const workers = await User.findAll({
            where: { id: { [Op.in]: workerIds } },
            attributes: ['id', 'name', 'email'],
          });

          // Verificar cada tipo de recordatorio
          // 12 horas antes (entre 11.5 y 12.5 horas)
          if (!job.reminder12hSent && hoursUntilStart <= 12.5 && hoursUntilStart > 11.5) {
            await sendReminders(job, client, workers, 12, startDate);
            job.reminder12hSent = true;
            await job.save();
            remindersSent++;
            console.log(`✅ [CRON] Recordatorio 12h enviado para trabajo "${job.title}"`);
          }
          // 6 horas antes (entre 5.5 y 6.5 horas)
          else if (!job.reminder6hSent && hoursUntilStart <= 6.5 && hoursUntilStart > 5.5) {
            await sendReminders(job, client, workers, 6, startDate);
            job.reminder6hSent = true;
            await job.save();
            remindersSent++;
            console.log(`✅ [CRON] Recordatorio 6h enviado para trabajo "${job.title}"`);
          }
          // 2 horas antes (entre 1.5 y 2.5 horas)
          else if (!job.reminder2hSent && hoursUntilStart <= 2.5 && hoursUntilStart > 1.5) {
            await sendReminders(job, client, workers, 2, startDate);
            job.reminder2hSent = true;
            await job.save();
            remindersSent++;
            console.log(`✅ [CRON] Recordatorio 2h enviado para trabajo "${job.title}"`);
          }
        } catch (error) {
          console.error(`❌ [CRON] Error procesando recordatorio para trabajo ${job.id}:`, error);
        }
      }

      console.log(`🎯 [CRON] Proceso de recordatorios completado: ${remindersSent} recordatorios enviados`);
    } catch (error) {
      console.error('❌ [CRON] Error en job de recordatorios:', error);
    }
  });

  console.log('✅ [CRON] Job de recordatorios de trabajos iniciado (cada 30 minutos)');
}

async function sendReminders(
  job: Job,
  client: any,
  workers: User[],
  hoursRemaining: number,
  startDate: Date
) {
  const formattedDate = startDate.toLocaleString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const urgencyColor = hoursRemaining <= 2 ? '#dc2626' : hoursRemaining <= 6 ? '#f59e0b' : '#3b82f6';
  const urgencyText = hoursRemaining <= 2 ? '¡Última llamada!' : hoursRemaining <= 6 ? '¡Prepárate!' : 'Recordatorio';

  // Notificación y email al cliente
  if (client) {
    await Notification.create({
      recipientId: client.id,
      type: 'job_reminder',
      category: 'jobs',
      title: `${urgencyText} Tu trabajo comienza en ${hoursRemaining} horas`,
      message: `El trabajo "${job.title}" comenzará el ${formattedDate}. ${workers.length > 1 ? `Tienes ${workers.length} trabajadores asignados.` : workers.length === 1 ? `Tu trabajador asignado es ${workers[0].name}.` : ''}`,
      relatedModel: 'Job',
      relatedId: job.id,
      actionText: 'Ver trabajo',
      data: {
        jobId: job.id,
        hoursRemaining,
        startDate: startDate.toISOString(),
      },
      read: false,
    });

    if (client.email) {
      const workerNames = workers.map(w => w.name).join(', ');
      await emailService.sendEmail({
        to: client.email,
        subject: `${urgencyText} - Tu trabajo "${job.title}" comienza en ${hoursRemaining} horas`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${urgencyColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">${urgencyText}</h1>
              <p style="margin: 10px 0 0; opacity: 0.9;">Tu trabajo comienza en ${hoursRemaining} horas</p>
            </div>

            <div style="background: #f8fafc; padding: 30px;">
              <h2 style="color: #1e293b; margin-top: 0;">${job.title}</h2>

              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px;"><strong>📅 Fecha de inicio:</strong> ${formattedDate}</p>
                <p style="margin: 0 0 10px;"><strong>📍 Ubicación:</strong> ${job.location}</p>
                ${workers.length > 0 ? `<p style="margin: 0;"><strong>👷 ${workers.length > 1 ? 'Trabajadores asignados' : 'Trabajador asignado'}:</strong> ${workerNames}</p>` : ''}
              </div>

              <p style="color: #64748b; text-align: center;">
                Asegúrate de estar listo para recibir a ${workers.length > 1 ? 'los trabajadores' : 'tu trabajador'} a tiempo.
              </p>

              <div style="text-align: center; margin-top: 20px;">
                <a href="${process.env.CLIENT_URL}/jobs/${job.id}"
                   style="display: inline-block; padding: 12px 24px; background-color: ${urgencyColor}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Ver detalles del trabajo
                </a>
              </div>
            </div>
          </div>
        `,
      });
    }
  }

  // Notificaciones y emails a los trabajadores
  for (const worker of workers) {
    await Notification.create({
      recipientId: worker.id,
      type: 'job_reminder',
      category: 'jobs',
      title: `${urgencyText} Tu trabajo comienza en ${hoursRemaining} horas`,
      message: `El trabajo "${job.title}" para ${client?.name || 'el cliente'} comenzará el ${formattedDate}. ¡Prepárate!`,
      relatedModel: 'Job',
      relatedId: job.id,
      actionText: 'Ver trabajo',
      data: {
        jobId: job.id,
        hoursRemaining,
        startDate: startDate.toISOString(),
      },
      read: false,
    });

    if (worker.email) {
      await emailService.sendEmail({
        to: worker.email,
        subject: `${urgencyText} - Tu trabajo "${job.title}" comienza en ${hoursRemaining} horas`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${urgencyColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">${urgencyText}</h1>
              <p style="margin: 10px 0 0; opacity: 0.9;">Tu trabajo comienza en ${hoursRemaining} horas</p>
            </div>

            <div style="background: #f8fafc; padding: 30px;">
              <h2 style="color: #1e293b; margin-top: 0;">${job.title}</h2>

              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px;"><strong>📅 Fecha de inicio:</strong> ${formattedDate}</p>
                <p style="margin: 0 0 10px;"><strong>📍 Ubicación:</strong> ${job.location}</p>
                <p style="margin: 0 0 10px;"><strong>👤 Cliente:</strong> ${client?.name || 'N/A'}</p>
                <p style="margin: 0;"><strong>💰 Precio acordado:</strong> $${job.price} ARS</p>
              </div>

              ${workers.length > 1 ? `
              <div style="background: #e0f2fe; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #0369a1;"><strong>👥 Trabajo en equipo:</strong> Trabajarás junto con ${workers.filter(w => w.id !== worker.id).map(w => w.name).join(', ')}</p>
              </div>
              ` : ''}

              <p style="color: #64748b; text-align: center;">
                ¡Recuerda llegar a tiempo y con todas las herramientas necesarias!
              </p>

              <div style="text-align: center; margin-top: 20px;">
                <a href="${process.env.CLIENT_URL}/jobs/${job.id}"
                   style="display: inline-block; padding: 12px 24px; background-color: ${urgencyColor}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Ver detalles del trabajo
                </a>
              </div>
            </div>
          </div>
        `,
      });
    }
  }
}
