'use strict';

/**
 * Owner-controlled runtime settings + per-action passwords.
 *
 * app_settings holds values the owner can change without a deploy; the platform
 * phase (beta = no commission) is the first, hence updated_by/updated_at.
 * action_passwords holds a separate secret per gated action, so switching the
 * platform out of beta does not ride on an open admin session.
 *
 * Idempotent: safe alongside ensureCriticalSchema, which creates the same
 * tables on boot.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(64) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS action_passwords (
        action VARCHAR(64) PRIMARY KEY,
        password_hash VARCHAR(255) NOT NULL,
        created_by UUID,
        reset_token_hash VARCHAR(255),
        reset_token_expires TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS action_passwords');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS app_settings');
  },
};
