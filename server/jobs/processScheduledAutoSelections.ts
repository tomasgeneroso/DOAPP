import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { socketService } from '../index.js';
import cacheService from '../services/cacheService.js';

/**
 * Procesar auto-selecciones programadas
 * Se ejecuta cada 5 minutos para seleccionar workers cuya hora de auto-selección llegó
 */

async function processScheduledAutoSelections() {
  try {
    const now = new Date();

    // Buscar trabajos con auto-selección programada que ya pasó la hora
    const jobsToAutoSelect = await Job.findAll({
      where: {
        autoSelectAt: { [Op.lte]: now },
        doerId: null, // Aún no seleccionado
        status: 'open' // Aún aceptando propuestas
      },
      include: [
        {
          model: Proposal,
          as: 'proposals',
          where: { status: 'pending' }
        }
      ]
    });

    if (jobsToAutoSelect.length === 0) {
      return; // Nada que hacer
    }

    console.log(`⏰ [AUTO-SELECT] Procesando ${jobsToAutoSelect.length} auto-selecciones programadas`);

    for (const job of jobsToAutoSelect) {
      try {
        const proposals = (job as any).proposals || [];

        if (proposals.length === 0) {
          console.warn(`⚠️ [AUTO-SELECT] Job ${job.id} sin propuestas - cancelando auto-select`);
          job.autoSelectAt = null;
          await job.save();
          continue;
        }

        // Seleccionar el primer worker (el que propuso primero)
        const selectedProposal = proposals[0];
        const selectedDoerId = selectedProposal.doerId;

        // Crear contrato si no existe
        let contract = await Contract.findOne({
          where: { jobId: job.id, doerId: selectedDoerId }
        });

        if (!contract) {
          contract = await Contract.create({
            jobId: job.id,
            clientId: job.clientId,
            doerId: selectedDoerId,
            type: 'trabajo',
            price: (job as any).budget || 0,
            status: 'pending',
            termsAccepted: false
          });
        }

        // Actualizar job
        job.status = 'in_progress';
        job.doerId = selectedDoerId;
        job.autoSelectAt = null; // Limpiar la hora de auto-selección
        await job.save();

        // Marcar propuesta como aprobada
        selectedProposal.status = 'approved';
        await (selectedProposal as any).save();

        // Rechazar otras propuestas
        for (const proposal of proposals) {
          if (proposal.id !== selectedProposal.id) {
            proposal.status = 'rejected';
            await (proposal as any).save();
          }
        }

        // Notificar a ambas partes
        socketService.notifyUser(
          job.clientId.toString(),
          'auto_selection_completed',
          {
            jobId: job.id,
            jobTitle: (job as any).title,
            selectedWorker: selectedDoerId
          }
        );

        socketService.notifyUser(
          selectedDoerId.toString(),
          'auto_selected_for_job',
          {
            jobId: job.id,
            jobTitle: (job as any).title,
            contractId: contract.id
          }
        );

        console.log(`✅ [AUTO-SELECT] Job ${job.id} auto-seleccionado: ${selectedDoerId}`);

        // Invalidar cache
        cacheService.delPattern(`jobs:${job.id}`);
        cacheService.delPattern(`contracts:*`);
      } catch (error: any) {
        console.error(`❌ [AUTO-SELECT] Error procesando job ${job.id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ [AUTO-SELECT] Error en processScheduledAutoSelections:', error);
  }
}

/**
 * Iniciar el cron job
 */
export function startScheduledAutoSelectionsJob() {
  // Ejecutar cada 5 minutos
  const interval = setInterval(processScheduledAutoSelections, 5 * 60 * 1000);

  // Ejecutar inmediatamente la primera vez
  processScheduledAutoSelections();

  console.log('🚀 [AUTO-SELECT] Cron job iniciado (cada 5 minutos)');

  return interval;
}

export default { processScheduledAutoSelections, startScheduledAutoSelectionsJob };
