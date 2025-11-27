/**
 * Script para agregar campos de revisión admin a la tabla jobs
 * Ejecutar con: npx tsx server/scripts/migrate-job-review-fields.ts
 */

import { sequelize } from '../config/database.js';

async function migrate() {
  try {
    console.log('🔄 Ejecutando migración: Agregar campos de revisión admin a jobs...');

    // Agregar columnas
    await sequelize.query(`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
    `);

    console.log('✅ Migración completada exitosamente!');
    console.log('   - rejected_reason: TEXT');
    console.log('   - reviewed_by: UUID (FK -> users.id)');
    console.log('   - reviewed_at: TIMESTAMP');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  }
}

migrate();
