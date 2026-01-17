/**
 * Script para enviar notificación de contrato a un trabajador
 * npx tsx server/scripts/sendContractNotification.ts <contractId>
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function sendNotification(contractId: string) {
  try {
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL\n");

    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: Job, as: 'job' },
        { model: User, as: 'doerUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'clientUser', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!contract) {
      console.error(`❌ Contrato no encontrado: ${contractId}`);
      process.exit(1);
    }

    const job = (contract as any).job;
    const doer = (contract as any).doerUser;
    const client = (contract as any).clientUser;

    console.log(`📋 Contrato encontrado:`);
    console.log(`   ID: ${contract.id}`);
    console.log(`   Job: ${job?.title || 'N/A'}`);
    console.log(`   Worker: ${doer?.name || contract.doerId}`);
    console.log(`   Client: ${client?.name || contract.clientId}`);

    // Create notification for worker
    const notification = await Notification.create({
      recipientId: contract.doerId,
      type: "success",
      category: "contract",
      title: "¡Has sido seleccionado!",
      message: `Felicitaciones! Fuiste elegido para el trabajo "${job?.title || 'Sin título'}". Revisa los detalles del contrato.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      actionText: 'Ver contrato',
      data: {
        jobId: contract.jobId,
        contractId: contract.id,
      },
      read: false,
    });

    console.log(`\n✅ Notificación creada: ${notification.id}`);
    console.log(`   Destinatario: ${doer?.name || contract.doerId}`);
    console.log(`   Título: ${notification.title}`);
    console.log(`   Mensaje: ${notification.message}`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Uso: npx tsx server/scripts/sendContractNotification.ts <contractId>");
  process.exit(1);
}

sendNotification(args[0]);
