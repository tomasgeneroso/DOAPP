import cron from 'node-cron';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { ChatMessage } from '../models/sql/ChatMessage.model.js';
import emailService from '../services/email.js';
import socketService from '../services/socket.js';
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
      // Incluir trabajos que no tienen el máximo de trabajadores seleccionados
      const jobsNeedingSelection = await Job.findAll({
        where: {
          status: 'open',
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

      // Filtrar solo los trabajos que necesitan más trabajadores
      const jobsToProcess = jobsNeedingSelection.filter(job => {
        const maxWorkers = job.maxWorkers || 1;
        const currentWorkers = job.selectedWorkers?.length || 0;
        return currentWorkers < maxWorkers;
      });

      if (jobsToProcess.length === 0) {
        console.log('✅ [CRON] No hay trabajos que requieran auto-selección');
        return;
      }

      console.log(`⚠️  [CRON] Encontrados ${jobsToProcess.length} trabajos para auto-selección`);

      let autoSelectedCount = 0;

      for (const job of jobsToProcess) {
        try {
          const maxWorkers = job.maxWorkers || 1;
          const currentWorkers = job.selectedWorkers || [];
          const workersNeeded = maxWorkers - currentWorkers.length;

          // Buscar propuestas pendientes ordenadas por fecha de creación
          const pendingProposals = await Proposal.findAll({
            where: {
              jobId: job.id,
              status: 'pending',
              freelancerId: { [Op.notIn]: currentWorkers.length > 0 ? currentWorkers : [''] },
            },
            include: [
              {
                model: User,
                as: 'freelancer',
                attributes: ['id', 'name', 'email'],
              },
            ],
            order: [['createdAt', 'ASC']],
            limit: workersNeeded,
          });

          if (pendingProposals.length === 0) {
            console.log(`⚠️  [CRON] Trabajo ${job.id} no tiene postulados pendientes, no se puede auto-seleccionar`);
            continue;
          }

          // Auto-seleccionar las propuestas necesarias
          const selectedWorkerIds: string[] = [...currentWorkers];
          const approvedProposalIds: string[] = [];

          for (const proposal of pendingProposals) {
            proposal.status = 'approved';
            await proposal.save();
            selectedWorkerIds.push(proposal.freelancerId);
            approvedProposalIds.push(proposal.id);
            console.log(`✅ [CRON] Auto-seleccionado trabajador ${proposal.freelancerId} para trabajo ${job.id}`);
          }

          // Actualizar trabajo con los nuevos trabajadores
          job.selectedWorkers = selectedWorkerIds;

          // Si es el primer trabajador, también asignar a doerId para compatibilidad
          if (!job.doerId && selectedWorkerIds.length > 0) {
            job.doerId = selectedWorkerIds[0];
          }

          // Solo rechazar otras propuestas si ya se alcanzó el máximo
          if (selectedWorkerIds.length >= maxWorkers) {
            await Proposal.update(
              {
                status: 'rejected',
                rejectionReason: `Auto-selección: Se completaron los ${maxWorkers} puesto${maxWorkers > 1 ? 's' : ''} disponible${maxWorkers > 1 ? 's' : ''}`,
              },
              {
                where: {
                  jobId: job.id,
                  id: { [Op.notIn]: approvedProposalIds },
                  status: 'pending',
                },
              }
            );
          }

          // Actualizar estado del trabajo
          const jobStartDate = job.startDate ? new Date(job.startDate) : new Date();
          if (jobStartDate <= new Date()) {
            job.status = 'in_progress';
          }

          await job.save();

          const client = job.client as any;

          // Crear contrato para cada trabajador seleccionado
          for (const proposal of pendingProposals) {
            const PLATFORM_COMMISSION = 0.1;
            const commission = proposal.proposedPrice * PLATFORM_COMMISSION;
            const totalPrice = proposal.proposedPrice + commission;

            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + (proposal.estimatedDuration || 7));

            const contract = await Contract.create({
              jobId: job.id,
              clientId: job.clientId,
              doerId: proposal.freelancerId,
              type: 'trabajo',
              price: proposal.proposedPrice,
              commission,
              totalPrice,
              startDate,
              endDate,
              status: 'pending',
              termsAccepted: false,
              termsAcceptedByClient: false,
              termsAcceptedByDoer: false,
            });

            const freelancer = proposal.freelancer as any;

            // Notificación al trabajador seleccionado
            await Notification.create({
              recipientId: proposal.freelancerId,
              type: 'success',
              category: 'contract',
              title: '¡Has sido seleccionado automáticamente!',
              message: `Fuiste elegido automáticamente para el trabajo "${job.title}" ya que el cliente no seleccionó un trabajador antes del límite de 24 horas.`,
              relatedModel: 'Contract',
              relatedId: contract.id,
              actionText: 'Ver contrato',
              data: {
                jobId: job.id,
                proposalId: proposal.id,
                contractId: contract.id,
              },
              read: false,
            });

            // Enviar email al trabajador
            if (freelancer?.email) {
              await emailService.sendEmail({
                to: freelancer.email,
                subject: `¡Has sido seleccionado automáticamente! - ${job.title}`,
                html: `
                  <h2>¡Felicitaciones ${freelancer.name}!</h2>
                  <p>Has sido seleccionado automáticamente para el trabajo <strong>"${job.title}"</strong>.</p>
                  <p>El cliente no seleccionó un trabajador antes del límite de 24 horas previas al inicio del trabajo, por lo que fuiste elegido automáticamente.</p>
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

            // Actualizar el mensaje del chat para reflejar la autoselección
            const chatMessage = await ChatMessage.findOne({
              where: {
                'metadata.proposalId': proposal.id,
                'metadata.action': 'job_application',
              },
            });

            if (chatMessage) {
              // Actualizar metadata para reflejar aprobación automática
              await chatMessage.update({
                metadata: {
                  ...chatMessage.metadata,
                  proposalStatus: 'approved',
                  contractId: contract.id,
                  autoSelected: true,
                  autoSelectedAt: new Date().toISOString(),
                },
              });

              // Emitir actualización por socket
              const updatedMessage = await ChatMessage.findByPk(chatMessage.id, {
                include: [{
                  model: User,
                  as: 'sender',
                  attributes: ['id', 'name', 'avatar'],
                }],
              });

              if (updatedMessage) {
                socketService.getIO().to(`conversation:${chatMessage.conversationId}`).emit('message:updated', updatedMessage);
              }
            }
          }

          // Notificación al cliente (una sola vez con todos los trabajadores)
          const workerNames = pendingProposals.map(p => (p.freelancer as any)?.name || 'Trabajador').join(', ');
          await Notification.create({
            recipientId: job.clientId,
            type: 'info',
            category: 'jobs',
            title: `${pendingProposals.length > 1 ? 'Trabajadores asignados' : 'Trabajador asignado'} automáticamente`,
            message: `Se asignó automáticamente a ${workerNames} para tu trabajo "${job.title}" ya que no seleccionaste antes del límite de 24 horas.`,
            relatedModel: 'Job',
            relatedId: job.id,
            actionText: 'Ver trabajo',
            data: {
              jobId: job.id,
              workerIds: selectedWorkerIds,
            },
            read: false,
          });

          // Email al cliente
          if (client?.email) {
            await emailService.sendEmail({
              to: client.email,
              subject: `${pendingProposals.length > 1 ? 'Trabajadores asignados' : 'Trabajador asignado'} automáticamente - ${job.title}`,
              html: `
                <h2>${pendingProposals.length > 1 ? 'Trabajadores asignados' : 'Trabajador asignado'} automáticamente</h2>
                <p>Como no seleccionaste ${pendingProposals.length > 1 ? 'trabajadores' : 'un trabajador'} para <strong>"${job.title}"</strong> antes del límite de 24 horas previas al inicio, hemos asignado automáticamente a: <strong>${workerNames}</strong>.</p>
                <p>Por favor, revisa los detalles del trabajo.</p>
                <p>
                  <a href="${process.env.CLIENT_URL}/jobs/${job.id}"
                     style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Ver trabajo
                  </a>
                </p>
              `,
            });
          }

          autoSelectedCount += pendingProposals.length;
          console.log(
            `✅ [CRON] Auto-seleccionados ${pendingProposals.length} trabajador(es) para trabajo "${job.title}"`
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

  // Cron job para activar trabajos cuya fecha de inicio ya llegó
  // Se ejecuta cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando trabajos para activar (fecha de inicio alcanzada)...');

      const now = new Date();

      // Buscar trabajos con doer asignado pero status "open" y fecha de inicio ya pasada
      const jobsToActivate = await Job.findAll({
        where: {
          status: 'open',
          doerId: { [Op.ne]: null },
          startDate: { [Op.lte]: now },
        },
      });

      if (jobsToActivate.length === 0) {
        console.log('✅ [CRON] No hay trabajos para activar');
        return;
      }

      console.log(`⚠️  [CRON] Encontrados ${jobsToActivate.length} trabajos para activar a in_progress`);

      for (const job of jobsToActivate) {
        try {
          job.status = 'in_progress';
          await job.save();
          console.log(`✅ [CRON] Trabajo "${job.title}" (${job.id}) activado a in_progress`);
        } catch (error) {
          console.error(`❌ [CRON] Error activando trabajo ${job.id}:`, error);
        }
      }

      console.log(`🎯 [CRON] Proceso completado: ${jobsToActivate.length} trabajos activados`);
    } catch (error) {
      console.error('❌ [CRON] Error en job de activación:', error);
    }
  });

  console.log('✅ [CRON] Job de activación de trabajos iniciado (cada 15 minutos)');

  // Cron job para iniciar contratos con código de seguridad verificado antes de la hora de inicio
  // Cuando el cliente verificó el código antes de la hora, el contrato queda en "accepted"
  // y debe pasar a "in_progress" cuando llega la hora de inicio
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();

      const contractsToActivate = await Contract.findAll({
        where: {
          status: 'accepted',
          clientConfirmedPairing: true,
          startDate: { [Op.lte]: now },
        },
      });

      if (contractsToActivate.length === 0) return;

      console.log(`⏰ [CRON] Encontrados ${contractsToActivate.length} contratos verificados para activar`);

      for (const contract of contractsToActivate) {
        try {
          contract.status = 'in_progress';
          contract.actualStartDate = now;
          await contract.save();
          console.log(`✅ [CRON] Contrato ${contract.id} activado a in_progress (código de seguridad verificado previamente)`);
        } catch (error) {
          console.error(`❌ [CRON] Error activando contrato ${contract.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ [CRON] Error en job de activación de contratos verificados:', error);
    }
  });

  console.log('✅ [CRON] Job de activación de contratos verificados iniciado (cada 5 minutos)');
}
