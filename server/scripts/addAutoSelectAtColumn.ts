import { config } from 'dotenv';
import { sequelize } from '../config/database.js';

config();

async function addColumn() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    const query = `
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS auto_select_at TIMESTAMP NULL;
    `;

    await sequelize.query(query);
    console.log('✅ Column auto_select_at added successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding column:', error.message);
    process.exit(1);
  }
}

addColumn();
