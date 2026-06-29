'use strict';

/**
 * Fiscal fields for the SUPER PRO "Centro Profesional" (Argentina).
 * - fiscal_condition: monotributo | responsable_inscripto | particular
 * - monotributo_category: AFIP category letter (A..K)
 * - monotributo_annual_limit: annual billing cap the user enters per their category
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS fiscal_condition         VARCHAR(30),
        ADD COLUMN IF NOT EXISTS monotributo_category     VARCHAR(5),
        ADD COLUMN IF NOT EXISTS monotributo_annual_limit DECIMAL(14,2)
    `);
  },

  async down() {
    // No-op: additive, idempotent. Leaving the columns is harmless.
  },
};
