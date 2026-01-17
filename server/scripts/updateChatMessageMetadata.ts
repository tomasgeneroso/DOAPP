/**
 * Script para actualizar metadata de mensaje de chat
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function updateMetadata() {
  try {
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL\n");

    const messageId = 'c27b61a2-a3db-4b9f-b837-01c868ad098e';
    
    // Find and update directly
    const message = await ChatMessage.findByPk(messageId);
    if (!message) {
      console.log("Message not found");
      process.exit(1);
    }

    console.log("Before:", JSON.stringify(message.metadata, null, 2));
    
    message.metadata = {
      jobId: '2d118baf-04dc-4340-a1d8-e5fe66d9a7de',
      proposalId: '85457b1b-922a-4626-80a1-158a023eb554',
      action: 'job_application',
      proposalStatus: 'approved',
      contractId: 'c9b9498f-cb00-4b73-b16f-1c54630dca7b',
    };
    await message.save();
    
    // Reload and verify
    await message.reload();
    console.log("After:", JSON.stringify(message.metadata, null, 2));

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

updateMetadata();
