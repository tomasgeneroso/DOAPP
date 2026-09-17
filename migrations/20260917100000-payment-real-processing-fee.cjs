'use strict';

/**
 * La tarifa real de la pasarela por pago, leida de fee_details del pago aprobado.
 *
 * Idempotente: IF NOT EXISTS, y ensureCriticalSchema la repite al arrancar.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS processing_fee NUMERIC(12,2);
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS net_received_amount NUMERIC(12,2);
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS money_release_date TIMESTAMPTZ;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE payments DROP COLUMN IF EXISTS processing_fee;
      ALTER TABLE payments DROP COLUMN IF EXISTS net_received_amount;
      ALTER TABLE payments DROP COLUMN IF EXISTS money_release_date;
    `);
  },
};
