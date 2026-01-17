/**
 * Script para verificar mensajes de chat con formato ||
 * Diagnóstico de por qué no se muestran con estilos
 */

import { Sequelize, QueryTypes } from 'sequelize';

const sequelize = new Sequelize('doapp_test', 'postgres', 'Corchoytomsy99', {
  host: 'localhost',
  port: 5433,
  dialect: 'postgres',
  logging: false,
});

async function checkMessages() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');

    // Buscar mensajes con || en el contenido
    const messagesWithDelimiter = await sequelize.query(
      `SELECT id, type, message, metadata, conversation_id, created_at
       FROM chat_messages
       WHERE message LIKE '%||%'
       ORDER BY created_at DESC
       LIMIT 10`,
      { type: QueryTypes.SELECT }
    );

    console.log(`📧 Encontrados ${messagesWithDelimiter.length} mensajes con || delimiter:\n`);

    for (const msg of messagesWithDelimiter as any[]) {
      console.log('─'.repeat(80));
      console.log(`ID: ${msg.id}`);
      console.log(`Type: "${msg.type}"`);
      console.log(`Message: ${msg.message?.substring(0, 150)}...`);
      console.log(`Metadata: ${JSON.stringify(msg.metadata, null, 2)}`);
      console.log(`ConversationId: ${msg.conversation_id}`);
      console.log(`CreatedAt: ${msg.created_at}`);
    }

    // Buscar mensajes tipo system
    const systemMessages = await sequelize.query(
      `SELECT id, type, message, metadata
       FROM chat_messages
       WHERE type = 'system'
       ORDER BY created_at DESC
       LIMIT 10`,
      { type: QueryTypes.SELECT }
    );

    console.log(`\n\n📋 Encontrados ${systemMessages.length} mensajes con type='system':\n`);

    for (const msg of systemMessages as any[]) {
      console.log('─'.repeat(80));
      console.log(`ID: ${msg.id}`);
      console.log(`Message: ${msg.message?.substring(0, 150)}...`);
      console.log(`Metadata: ${JSON.stringify(msg.metadata, null, 2)}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkMessages();
