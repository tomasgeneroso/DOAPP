'use strict';

/**
 * Un acuerdo aceptado entre las partes no mueve plata: queda esperando que un
 * administrador ejecute la transaccion. Idempotente; espejada en ensureSchema.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE disputes ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ;
      ALTER TABLE disputes ADD COLUMN IF NOT EXISTS agreement_accepted_by UUID;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE disputes DROP COLUMN IF EXISTS agreement_accepted_at;
      ALTER TABLE disputes DROP COLUMN IF EXISTS agreement_accepted_by;
    `);
  },
};
