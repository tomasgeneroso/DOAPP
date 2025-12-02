import cron from 'node-cron';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Cron job para auto-seleccionar trabajador 24h antes del inicio del trabajo
 * Se ejecuta cada hora para verificar trabajos que necesitan auto-selección
 */
export function startAutoSelectWorkerJob() {
  // Ejecutar cada hora: 0 * * * *
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando trabajos para auto-selección de trabajador...');

      const now = new Date();
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Buscar trabajos abiertos que comienzan en las próximas 24 horas
      const jobsNeedingSelection = await Job.findAll({
        where: {
          status: 'open',
          doerId: null,
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

      if (jobsNeedingSelection.length === 0) {
        console.log('✅ [CRON] No hay trabajos que requieran auto-selección');
        return;
      }

      console.log(`⚠️  [CRON] Encontrados ${jobsNeedingSelection.length} trabajos para auto-selección`);

      let autoSelectedCount = 0;

      for (const job of jobsNeedingSelection) {
        try {
          // Buscar la primera propuesta pendiente (ordenada por fecha de creación)
          const firstProposal = await Proposal.findOne({
            where: {
              jobId: job.id,
              status: 'pending',
            },
            include: [
              {
                model: User,
                as: 'freelancer',
                attributes: ['id', 'name', 'email'],
              },
            ],
            order: [['createdAt', 'ASC']],
          });

          if (!firstProposal) {
            console.log(`⚠️  [CRON] Trabajo ${job.id} no tiene postulados, no se puede auto-seleccionar`);
            continue;
          }

          // Aprobar propuesta
          firstProposal.status = 'approved';
          await firstProposal.save();

          // Rechazar otras propuestas
          await Proposal.update(
            {
              status: 'rejected',
              rejectionReason: 'Auto-selección: Se eligió a otro candidato automáticamente',
            },
            {
              where: {
                jobId: job.id,
                id: { [Op.ne]: firstProposal.id },
                status: 'pending',
              },
            }
          );

          // Actualizar trabajo
          job.status = 'in_progress';
          job.doerId = firstProposal.freelancerId;
          await job.save();

          // Crear contrato
          const PLATFORM_COMMISSION = 0.1;
          const commission = firstProposal.proposedPrice * PLATFORM_COMMISSION;
          const totalPrice = firstProposal.proposedPrice + commission;

          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + (firstProposal.estimatedDuration || 7));

          const contract = await Contract.create({
            jobId: job.id,
            clientId: job.clientId,
            doerId: firstProposal.freelancerId,
            type: 'trabajo',
            price: firstProposal.proposedPrice,
            commission,
            totalPrice,
            startDate,
            endDate,
            status: 'pending',
            termsAccepted: false,
            termsAcceptedByClient: false,
            termsAcceptedByDoer: false,
          });

          const freelancer = firstProposal.freelancer as any;
          const client = job.client as any;

          // Notificación al trabajador seleccionado
          await Notification.create({
            userId: firstProposal.freelancerId,
            type: 'auto_selected',
            title: '¡Has sido seleccionado automáticamente!',
            message: `Fuiste elegido automáticamente para el trabajo "${job.title}" ya que el cliente no seleccionó un trabajador antes del límite de 24 horas.`,
            data: {
              jobId: job.id,
              proposalId: firstProposal.id,
              contractId: contract.id,
            },
            read: false,
          });

          // Notificación al cliente
          await Notification.create({
            userId: job.clientId,
            type: 'auto_selection_completed',
            title: 'Trabajador asignado automáticamente',
            message: `Se asignó automáticamente a ${freelancer?.name || 'un trabajador'} para tu trabajo "${job.title}" ya que no seleccionaste un trabajador antes del límite de 24 horas.`,
            data: {
              jobId: job.id,
              contractId: contract.id,
              workerId: firstProposal.freelancerId,
            },
            read: false,
          });

          // Enviar emails
          if (freelancer?.email) {
            await emailService.sendEmail({
              to: freelancer.email,
              subject: `¡Has sido seleccionado automáticamente! - ${job.title}`,
              html: `
                <h2>¡Felicitaciones ${freelancer.name}!</h2>
                <p>Has sido seleccionado automáticamente para el trabajo <strong>"${job.title}"</strong>.</p>
                <p>El cliente no seleccionó un trabajador antes del límite de 24 horas previas al inicio del trabajo, por lo que fuiste elegido automáticamente como primer postulante.</p>
                <p>Por favor, revisa los detalles del contrato lo antes posible.</p>
                <p>
                  <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                     style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Ver contrato
                  </a>
                </p>
              `,
            });
          }

          if (client?.email) {
            await emailService.sendEmail({
              to: client.email,
              subject: `Trabajador asignado automáticamente - ${job.title}`,
              html: `
                <h2>Trabajador asignado automáticamente</h2>
                <p>Como no seleccionaste un trabajador para <strong>"${job.title}"</strong> antes del límite de 24 horas previas al inicio, hemos asignado automáticamente a <strong>${freelancer?.name || 'un trabajador'}</strong>.</p>
                <p>Este fue el primer postulante que aplicó a tu trabajo.</p>
                <p>Por favor, revisa los detalles del contrato.</p>
                <p>
                  <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                     style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Ver contrato
                  </a>
                </p>
              `,
            });
          }

          autoSelectedCount++;
          console.log(
            `✅ [CRON] Auto-seleccionado trabajador ${freelancer?.name} para trabajo "${job.title}" → Contrato ${contract.id}`
          );
        } catch (error) {
          console.error(`❌ [CRON] Error auto-seleccionando para trabajo ${job.id}:`, error);
        }
      }

      console.log(
        `🎯 [CRON] Proceso completado: ${autoSelectedCount}/${jobsNeedingSelection.length} trabajos con trabajador auto-seleccionado`
      );
    } catch (error) {
      console.error('❌ [CRON] Error en job de auto-selección:', error);
    }
  });

  console.log('✅ [CRON] Job de auto-selección de trabajadores iniciado (cada hora)');
}
