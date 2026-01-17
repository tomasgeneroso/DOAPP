/**
 * Script para reparar un trabajo que tiene propuesta aprobada pero sin contrato
 * Crea el contrato y actualiza selectedWorkers
 *
 * npx tsx server/scripts/repairJobFromProposal.ts <jobId>
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Proposal } from "../models/sql/Proposal.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { calculateCommission } from "../services/commissionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function repairJob(jobId: string) {
  try {
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL\n");

    // 1. Find the job
    const job = await Job.findByPk(jobId);
    if (!job) {
      console.error(`❌ Trabajo no encontrado: ${jobId}`);
      process.exit(1);
    }

    console.log(`📋 Trabajo: ${job.title} (${job.status})`);
    console.log(`   Precio: $${job.price}`);

    // 2. Find approved proposals without contracts
    const approvedProposals = await Proposal.findAll({
      where: {
        jobId,
        status: 'approved'
      },
      include: [
        { model: User, as: 'freelancer', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (approvedProposals.length === 0) {
      console.log("ℹ️ No hay propuestas aprobadas para reparar");
      process.exit(0);
    }

    console.log(`\n📝 Propuestas aprobadas encontradas: ${approvedProposals.length}`);

    let createdContracts = 0;
    const newSelectedWorkers: string[] = [...(job.selectedWorkers || [])];
    const newWorkerAllocations: any[] = [...(job.workerAllocations || [])];

    for (const proposal of approvedProposals) {
      const freelancer = (proposal as any).freelancer;
      const workerId = proposal.freelancerId;

      console.log(`\n🔧 Procesando: ${freelancer?.name || workerId}`);

      // Check if contract already exists
      const existingContract = await Contract.findOne({
        where: {
          jobId,
          doerId: workerId
        }
      });

      if (existingContract) {
        console.log(`   ✅ Contrato ya existe: ${existingContract.id}`);

        // Make sure worker is in selectedWorkers
        if (!newSelectedWorkers.includes(workerId)) {
          newSelectedWorkers.push(workerId);
          console.log(`   → Agregado a selectedWorkers`);
        }
        continue;
      }

      // Calculate allocation
      const maxWorkers = job.maxWorkers || 1;
      const workerAllocation = Math.floor(Number(job.price) / maxWorkers);
      const percentageOfBudget = 100 / maxWorkers;

      // Calculate commission
      const commissionResult = await calculateCommission(job.clientId, workerAllocation);
      const commission = commissionResult.commission;
      const totalPrice = workerAllocation + commission;

      // Dates
      const startDate = job.startDate ? new Date(job.startDate) : new Date();
      const endDate = job.endDate
        ? new Date(job.endDate)
        : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Generate pairing code
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const pairingExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      console.log(`   📋 Creando contrato:`);
      console.log(`      Monto: $${workerAllocation}`);
      console.log(`      Comisión (${commissionResult.rate}%): $${commission}`);
      console.log(`      Total: $${totalPrice}`);

      // Create contract
      const contract = await Contract.create({
        jobId: job.id,
        clientId: job.clientId,
        doerId: workerId,
        type: "trabajo",
        price: workerAllocation,
        commission,
        totalPrice,
        startDate,
        endDate,
        status: "pending",
        termsAccepted: false,
        termsAcceptedByClient: false,
        termsAcceptedByDoer: false,
        pairingCode,
        pairingGeneratedAt: new Date(),
        pairingExpiry,
        allocatedAmount: workerAllocation,
        percentageOfBudget,
      });

      console.log(`   ✅ Contrato creado: ${contract.id}`);
      createdContracts++;

      // Create notification for worker
      const notification = await Notification.create({
        recipientId: workerId,
        type: "success",
        category: "contract",
        title: "¡Has sido seleccionado!",
        message: `Felicitaciones! Fuiste elegido para el trabajo "${job.title}". Revisa los detalles del contrato.`,
        relatedModel: 'Contract',
        relatedId: contract.id,
        actionText: 'Ver contrato',
        data: {
          jobId: job.id,
          contractId: contract.id,
        },
        read: false,
      });
      console.log(`   📬 Notificación creada: ${notification.id}`);

      // Update chat message metadata to reflect approved status
      const updatedMessages = await ChatMessage.update(
        {
          metadata: {
            jobId: job.id,
            proposalId: proposal.id,
            action: 'job_application',
            proposalStatus: 'approved',
            contractId: contract.id,
          }
        },
        {
          where: {
            type: 'system',
            'metadata.proposalId': proposal.id,
          }
        }
      );
      console.log(`   💬 Mensajes de chat actualizados: ${updatedMessages[0]}`);

      // Update selectedWorkers and workerAllocations
      if (!newSelectedWorkers.includes(workerId)) {
        newSelectedWorkers.push(workerId);
      }

      const existingAllocation = newWorkerAllocations.find((wa: any) => wa.workerId === workerId);
      if (!existingAllocation) {
        newWorkerAllocations.push({
          workerId,
          allocatedAmount: workerAllocation,
          percentage: percentageOfBudget
        });
      }
    }

    // Update job
    console.log(`\n📦 Actualizando trabajo...`);
    job.selectedWorkers = newSelectedWorkers;
    job.workerAllocations = newWorkerAllocations;

    // Update status if needed
    const now = new Date();
    const jobStartDate = job.startDate ? new Date(job.startDate) : now;

    if (newSelectedWorkers.length >= (job.maxWorkers || 1)) {
      if (jobStartDate <= now) {
        job.status = 'in_progress';
        console.log(`   → Status cambiado a 'in_progress' (fecha de inicio ya pasó)`);
      }
    }

    await job.save();

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`🎉 REPARACIÓN COMPLETADA`);
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`   Contratos creados: ${createdContracts}`);
    console.log(`   Selected Workers: ${JSON.stringify(newSelectedWorkers)}`);
    console.log(`   Worker Allocations: ${JSON.stringify(newWorkerAllocations)}`);
    console.log(`   Job Status: ${job.status}`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Uso: npx tsx server/scripts/repairJobFromProposal.ts <jobId>");
  process.exit(1);
}

repairJob(args[0]);
