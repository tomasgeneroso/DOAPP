'use strict';

/**
 * Allow file_url / file_type / file_name to be NULL on payment_proofs so a
 * "nota de comprobante de pago" can be text-only (no attachment). Real receipts
 * still carry a file. Idempotent.
 */
module.exports = {
  async up(queryInterface) {
    for (const col of ['file_url', 'file_type', 'file_name']) {
      await queryInterface.sequelize
        .query(`ALTER TABLE payment_proofs ALTER COLUMN ${col} DROP NOT NULL`)
        .catch(() => {});
    }
  },

  async down(queryInterface) {
    // Not restoring NOT NULL on down: text-only notes may exist and would break it.
  },
};
