/**
 * Script para reparar trabajos que tienen trabajadores seleccionados pero sin contrato
 *
 * Uso:
 * npx tsx server/scripts/repairJobWithoutContract.ts <jobId>
 * npx tsx server/scripts/repairJobWithoutContract.ts --list  (lista trabajos con problemas)
 *
 * Ejemplo:
 * npx tsx server/scripts/repairJobWithoutContract.ts abc123-job-id
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Proposal } from "../models/sql/Proposal.model.js";
import { User } from "../models/sql/User.model.js";
import { calculateCommission } from "../services/commissionService.js";
import { Op } from "sequelize";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function listProblematicJobs() {
  try {
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL\n");

    // Buscar trabajos con trabajadores seleccionados
    const jobs = await Job.findAll({
      where: {
        selectedWorkers: {
          [Op.and]: [
            { [Op.ne]: null },
            { [Op.ne]: [] }
          ]
        },
        status: {
          [Op.in]: ['open', 'in_progress', 'pending_approval']
        }
      },
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] }
      ]
    });

    console.log(`📋 Encontrados ${jobs.length} trabajos con trabajadores seleccionados\n`);

    for (const job of jobs) {
      const selectedWorkers = job.selectedWorkers || [];

      // Verificar si cada trabajador tiene contrato
      for (const workerId of selectedWorkers) {
        const contract = await Contract.findOne({
          where: {
            jobId: job.id,
            doerId: workerId
          }
        });

        const worker = await User.findByPk(workerId, { attributes: ['name', 'email'] });

        if (!contract) {
          console.log(`❌ PROBLEMA ENCONTRADO:`);
          console.log(`   Job ID: ${job.id}`);
          console.log(`   Job Title: ${job.title}`);
          console.log(`   Cliente: ${(job as any).client?.name || 'N/A'}`);
          console.log(`   Worker: ${worker?.name || workerId} (${worker?.email || 'N/A'})`);
          console.log(`   Status: ${job.status}`);
          console.log(`   Precio: $${job.price}`);
          console.log(`   → Sin contrato para este trabajador\n`);
        } else {
          console.log(`✅ OK: Job "${job.title}" - Worker ${worker?.name || workerId} tiene contrato ${contract.id}`);
        }
      }
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function repairJob(jobId: string) {
  try {
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL\n");

    // Buscar el trabajo
    const job = await Job.findByPk(jobId, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!job) {
      console.error(`❌ Trabajo no encontrado: ${jobId}`);
      process.exit(1);
    }

    console.log(`📋 Trabajo encontrado:`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Título: ${job.title}`);
    console.log(`   Cliente: ${(job as any).client?.name || job.clientId}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Precio: $${job.price}`);
    console.log(`   Max Workers: ${job.maxWorkers || 1}`);
    console.log(`   Selected Workers: ${JSON.stringify(job.selectedWorkers || [])}`);
    console.log(`   Worker Allocations: ${JSON.stringify(job.workerAllocations || [])}\n`);

    const selectedWorkers = job.selectedWorkers || [];

    if (selectedWorkers.length === 0) {
      console.log("ℹ️ Este trabajo no tiene trabajadores seleccionados.");
      process.exit(0);
    }

    let repaired = 0;

    for (const workerId of selectedWorkers) {
      // Verificar si ya existe contrato
      const existingContract = await Contract.findOne({
        where: {
          jobId: job.id,
          doerId: workerId
        }
      });

      if (existingContract) {
        console.log(`✅ Contrato ya existe para worker ${workerId}: ${existingContract.id}`);
        continue;
      }

      // Buscar la propuesta aprobada
      const proposal = await Proposal.findOne({
        where: {
          jobId: job.id,
          freelancerId: workerId,
          status: 'approved'
        }
      });

      const worker = await User.findByPk(workerId, { attributes: ['id', 'name', 'email'] });

      console.log(`\n🔧 Reparando: Worker ${worker?.name || workerId}`);

      if (!proposal) {
        console.log(`   ⚠️ No hay propuesta aprobada para este worker`);

        // Buscar cualquier propuesta de este worker para este job
        const anyProposal = await Proposal.findOne({
          where: {
            jobId: job.id,
            freelancerId: workerId
          }
        });

        if (anyProposal) {
          console.log(`   📝 Encontrada propuesta con status: ${anyProposal.status}`);
          console.log(`   → Cambiando status a 'approved'...`);
          anyProposal.status = 'approved';
          await anyProposal.save();
        } else {
          console.log(`   ❌ No hay ninguna propuesta de este worker. No se puede crear contrato automáticamente.`);
          console.log(`   → Debes crear una propuesta primero o quitar al worker de selectedWorkers`);
          continue;
        }
      }

      // Calcular el monto asignado
      const maxWorkers = job.maxWorkers || 1;
      const workerAllocation = job.workerAllocations?.find(
        (wa: any) => wa.workerId === workerId
      );

      const allocatedAmount = workerAllocation?.allocatedAmount || Math.floor(job.price / maxWorkers);
      const percentageOfBudget = workerAllocation?.percentage || (100 / maxWorkers);

      // Calcular comisión
      const commissionResult = await calculateCommission(job.clientId, allocatedAmount);
      const commission = commissionResult.commission;
      const totalPrice = allocatedAmount + commission;

      // Fechas
      const startDate = job.startDate ? new Date(job.startDate) : new Date();
      const endDate = job.endDate
        ? new Date(job.endDate)
        : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Generar código de emparejamiento
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const pairingExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      console.log(`   📋 Creando contrato:`);
      console.log(`      - Monto asignado: $${allocatedAmount}`);
      console.log(`      - Comisión: $${commission}`);
      console.log(`      - Total: $${totalPrice}`);
      console.log(`      - Porcentaje: ${percentageOfBudget}%`);

      // Crear el contrato
      const contract = await Contract.create({
        jobId: job.id,
        clientId: job.clientId,
        doerId: workerId,
        type: "trabajo",
        price: allocatedAmount,
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
        allocatedAmount,
        percentageOfBudget,
      });

      console.log(`   ✅ Contrato creado: ${contract.id}`);
      repaired++;
    }

    console.log(`\n🎉 Reparación completada: ${repaired} contratos creados`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Obtener argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
📝 Uso: npx tsx server/scripts/repairJobWithoutContract.ts <jobId|--list>

Opciones:
  --list           Lista todos los trabajos con trabajadores seleccionados sin contrato
  <jobId>          Repara un trabajo específico creando los contratos faltantes

Ejemplos:
  npx tsx server/scripts/repairJobWithoutContract.ts --list
  npx tsx server/scripts/repairJobWithoutContract.ts abc123-job-id
  `);
  process.exit(1);
}

const [arg] = args;

if (arg === '--list') {
  listProblematicJobs();
} else {
  repairJob(arg);
}
