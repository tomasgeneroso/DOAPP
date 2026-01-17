/**
 * Script para diagnosticar un trabajo y sus propuestas/contratos
 * npx tsx server/scripts/diagnoseJob.ts <jobId>
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Proposal } from "../models/sql/Proposal.model.js";
import { User } from "../models/sql/User.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { Op } from "sequelize";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function diagnoseJob(jobId: string) {
  try {
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL\n");

    // 1. Job details
    const job = await Job.findByPk(jobId, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!job) {
      console.error(`❌ Trabajo no encontrado: ${jobId}`);
      process.exit(1);
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("📋 JOB DETAILS");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`ID: ${job.id}`);
    console.log(`Título: ${job.title}`);
    console.log(`Cliente: ${(job as any).client?.name} (${job.clientId})`);
    console.log(`Status: ${job.status}`);
    console.log(`Precio: $${job.price}`);
    console.log(`Max Workers: ${job.maxWorkers || 1}`);
    console.log(`Selected Workers: ${JSON.stringify(job.selectedWorkers)}`);
    console.log(`Worker Allocations: ${JSON.stringify(job.workerAllocations)}`);
    console.log(`Start Date: ${job.startDate}`);
    console.log(`End Date: ${job.endDate}`);
    console.log(`Created: ${job.createdAt}`);

    // 2. Proposals
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📝 PROPOSALS");
    console.log("═══════════════════════════════════════════════════════════");

    const proposals = await Proposal.findAll({
      where: { jobId },
      include: [
        { model: User, as: 'freelancer', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (proposals.length === 0) {
      console.log("No hay propuestas para este trabajo");
    } else {
      for (const p of proposals) {
        const freelancer = (p as any).freelancer;
        console.log(`\n  ID: ${p.id}`);
        console.log(`  Worker: ${freelancer?.name || 'N/A'} (${p.freelancerId})`);
        console.log(`  Status: ${p.status}`);
        console.log(`  Proposed Price: $${p.proposedPrice || 'N/A'}`);
        console.log(`  Created: ${p.createdAt}`);
        console.log(`  Updated: ${p.updatedAt}`);
      }
    }

    // 3. Contracts
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📄 CONTRACTS");
    console.log("═══════════════════════════════════════════════════════════");

    const contracts = await Contract.findAll({
      where: { jobId },
      include: [
        { model: User, as: 'doerUser', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (contracts.length === 0) {
      console.log("❌ No hay contratos para este trabajo");
    } else {
      for (const c of contracts) {
        const doer = (c as any).doerUser;
        console.log(`\n  ID: ${c.id}`);
        console.log(`  Worker: ${doer?.name || 'N/A'} (${c.doerId})`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Price: $${c.price}`);
        console.log(`  Commission: $${c.commission}`);
        console.log(`  Created: ${c.createdAt}`);
      }
    }

    // 4. System chat messages related to proposals
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("💬 SYSTEM MESSAGES (propuestas)");
    console.log("═══════════════════════════════════════════════════════════");

    const systemMessages = await ChatMessage.findAll({
      where: {
        type: 'system',
        metadata: {
          jobId: jobId
        }
      },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    if (systemMessages.length === 0) {
      console.log("No hay mensajes de sistema encontrados");
    } else {
      for (const msg of systemMessages) {
        console.log(`\n  Message: ${msg.message?.substring(0, 100)}...`);
        console.log(`  Metadata: ${JSON.stringify(msg.metadata)}`);
        console.log(`  Created: ${msg.createdAt}`);
      }
    }

    // 5. Analysis
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("🔍 ANÁLISIS");
    console.log("═══════════════════════════════════════════════════════════");

    const approvedProposals = proposals.filter(p => p.status === 'approved');
    const selectedWorkers = job.selectedWorkers || [];

    if (approvedProposals.length > 0 && contracts.length === 0) {
      console.log("❌ PROBLEMA: Hay propuestas aprobadas pero NO hay contratos");
      console.log("   → La creación del contrato falló después de aprobar la propuesta");
    }

    if (selectedWorkers.length > 0 && contracts.length === 0) {
      console.log("❌ PROBLEMA: Hay workers seleccionados pero NO hay contratos");
    }

    if (selectedWorkers.length === 0 && approvedProposals.length > 0) {
      console.log("❌ PROBLEMA: Hay propuestas aprobadas pero selectedWorkers está vacío");
      console.log("   → El array selectedWorkers no se guardó correctamente");
    }

    if (selectedWorkers.length === 0 && approvedProposals.length === 0 && contracts.length === 0) {
      console.log("ℹ️ Estado: Trabajo sin trabajadores seleccionados (normal si no se aprobó ninguna propuesta)");
    }

    if (contracts.length > 0 && contracts.length === approvedProposals.length) {
      console.log("✅ Estado: Todo correcto - cada propuesta aprobada tiene su contrato");
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Uso: npx tsx server/scripts/diagnoseJob.ts <jobId>");
  process.exit(1);
}

diagnoseJob(args[0]);
