/**
 * Migration Script: Add Binance fields to PaymentProof table
 *
 * This script adds the following columns to payment_proofs table:
 * - binance_transaction_id: VARCHAR(255) - Transaction ID or hash from Binance/blockchain
 * - binance_sender_user_id: VARCHAR(255) - Sender Binance ID or nickname
 */

import { sequelize } from '../config/database.js';
import { QueryTypes } from 'sequelize';

async function migrate() {
  try {
    console.log('🚀 Starting migration: Add Binance fields to PaymentProof...');

    // Check if columns already exist
    const checkColumns = await sequelize.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payment_proofs'
      AND column_name IN ('binance_transaction_id', 'binance_sender_user_id')
      `,
      { type: QueryTypes.SELECT }
    );

    if (checkColumns.length === 2) {
      console.log('✅ Columns already exist, skipping migration');
      return;
    }

    // Add binance_transaction_id column if it doesn't exist
    if (!checkColumns.find((col: any) => col.column_name === 'binance_transaction_id')) {
      console.log('📝 Adding binance_transaction_id column...');
      await sequelize.query(
        `ALTER TABLE payment_proofs ADD COLUMN binance_transaction_id VARCHAR(255) NULL`,
        { type: QueryTypes.RAW }
      );

      // Add comment (PostgreSQL syntax)
      await sequelize.query(
        `COMMENT ON COLUMN payment_proofs.binance_transaction_id IS 'Transaction ID or hash from Binance/blockchain'`,
        { type: QueryTypes.RAW }
      );
      console.log('✅ Added binance_transaction_id column');
    } else {
      console.log('⏭️  binance_transaction_id column already exists');
    }

    // Add binance_sender_user_id column if it doesn't exist
    if (!checkColumns.find((col: any) => col.column_name === 'binance_sender_user_id')) {
      console.log('📝 Adding binance_sender_user_id column...');
      await sequelize.query(
        `ALTER TABLE payment_proofs ADD COLUMN binance_sender_user_id VARCHAR(255) NULL`,
        { type: QueryTypes.RAW }
      );

      // Add comment (PostgreSQL syntax)
      await sequelize.query(
        `COMMENT ON COLUMN payment_proofs.binance_sender_user_id IS 'Sender Binance ID or nickname (who sent the payment)'`,
        { type: QueryTypes.RAW }
      );
      console.log('✅ Added binance_sender_user_id column');
    } else {
      console.log('⏭️  binance_sender_user_id column already exists');
    }

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
(async () => {
  try {
    // Initialize database connection
    const { initDatabase } = await import('../config/database.js');
    await initDatabase();

    // Run migration
    await migrate();

    // Close connection
    await sequelize.close();
    console.log('👋 Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
})();
