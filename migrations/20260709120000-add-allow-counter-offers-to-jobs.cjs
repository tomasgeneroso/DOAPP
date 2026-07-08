'use strict';

/**
 * Adds jobs.allow_counter_offers — owner setting controlling whether applicants
 * may propose a price different from the posted one. Defaults to true to preserve
 * the previous behaviour. Idempotent (ADD COLUMN IF NOT EXISTS).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "allow_counter_offers" BOOLEAN NOT NULL DEFAULT true`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE jobs DROP COLUMN IF EXISTS "allow_counter_offers"`
    );
  },
};
