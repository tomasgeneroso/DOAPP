'use strict';

/**
 * License expiry date for the SUPER PRO "Profesionalización" tab — enables
 * renewal reminders for users with a professional license (matrícula).
 * Idempotent.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMPTZ
    `);
  },

  async down() {
    // No-op: additive, idempotent.
  },
};
