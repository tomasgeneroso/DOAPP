/**
 * Verify Binance columns were added successfully
 */

import { sequelize } from '../config/database.js';
import { QueryTypes } from 'sequelize';

(async () => {
  try {
    // Initialize database connection
    const { initDatabase } = await import('../config/database.js');
    await initDatabase();

    console.log('🔍 Checking Binance columns in payment_proofs table...\n');

    const result = await sequelize.query(
      `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payment_proofs'
      AND column_name IN ('binance_transaction_id', 'binance_sender_user_id')
      ORDER BY column_name
      `,
      { type: QueryTypes.SELECT }
    );

    if (result.length === 2) {
      console.log('✅ Both columns exist!\n');
      console.log('Column Details:');
      console.table(result);
    } else {
      console.log('❌ Columns not found or incomplete');
      console.log('Found:', result);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
