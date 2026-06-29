'use strict';

/**
 * Monthly billing goal for the SUPER PRO finance panel. Idempotent.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS monthly_billing_goal DECIMAL(14,2)
    `);
  },
  async down() {
    // No-op: additive, idempotent.
  },
};
