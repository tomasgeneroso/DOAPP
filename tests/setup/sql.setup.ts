/**
 * Test Setup for SQL Models
 *
 * This file runs before all tests and sets up the test database
 */

import 'reflect-metadata';
import { config } from 'dotenv';

// Load test environment variables FIRST, before importing database
config({ path: '.env.test' });

import { initDatabase, closeDatabase } from '../../server/config/database.js';

// Global setup
beforeAll(async () => {
  // Connect to test database and register models
  try {
    await initDatabase();
    console.log('✅ Test database initialized');

    // Clean database before starting tests
    const { sequelize } = await import('../../server/config/database.js');
    await sequelize.query('SET CONSTRAINTS ALL DEFERRED');

    // Truncate all tables in correct order
    const tables = [
      'contracts', 'jobs', 'proposals', 'reviews',
      'payments', 'disputes', 'tickets', 'conversations',
      'chat_messages', 'notifications', 'portfolio_items',
      'roles', 'contract_change_requests', 'memberships',
      'referrals', 'balance_transactions', 'withdrawal_requests',
      'refresh_tokens', 'password_reset_tokens', 'advertisements',
      'promoters', 'user_analytics', 'users'
    ];

    for (const table of tables) {
      try {
        await sequelize.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      } catch (error) {
        // Table might not exist yet, that's ok
      }
    }

    console.log('✅ Database cleaned before tests');
  } catch (error) {
    console.error('❌ Unable to connect to database:', error);
    throw error;
  }
}, 30000); // 30 second timeout for initial setup

// Global teardown
afterAll(async () => {
  // Final cleanup
  try {
    const { sequelize } = await import('../../server/config/database.js');

    // Truncate all tables again
    const tables = [
      'contracts', 'jobs', 'users'
    ];

    for (const table of tables) {
      try {
        await sequelize.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }

  // Close database connection
  await closeDatabase();
  console.log('✅ Database connection closed');
});
