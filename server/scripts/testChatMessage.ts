import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { User } from "../models/sql/User.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function test() {
  await initDatabase();

  const message = await ChatMessage.findByPk('c27b61a2-a3db-4b9f-b837-01c868ad098e', {
    include: [{
      model: User,
      as: 'sender',
      attributes: ['id', 'name', 'avatar'],
    }],
  });

  if (message) {
    console.log('Message found:');
    console.log('  ID:', message.id);
    console.log('  Type:', message.type);
    console.log('  Metadata (raw):', message.metadata);
    console.log('  Metadata type:', typeof message.metadata);
    console.log('  Has action:', message.metadata?.action);

    const json = message.toJSON();
    console.log('\nJSON output:');
    console.log('  Metadata:', json.metadata);
    console.log('  Full JSON:', JSON.stringify(json, null, 2).substring(0, 500));
  } else {
    console.log('Message not found');
  }

  process.exit(0);
}

test();
