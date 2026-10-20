'use strict';

/**
 * «Ya pagué»: quien paga por transferencia declara quién hizo la transferencia (nombre y documento) y cuándo, además del número de operación
 * (`bank_reference`, que ya existía) y el banco de origen (`sender_bank_name`). Sirve para cruzar el comprobante con el extracto.
 *
 * Idempotente (IF NOT EXISTS): también la repite `ensureCriticalSchema` al arrancar.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sender_name VARCHAR(160)`);
    await q.query(`ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sender_document VARCHAR(20)`);
    await q.query(`ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS transfer_date DATE`);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`ALTER TABLE payment_proofs DROP COLUMN IF EXISTS transfer_date`);
    await q.query(`ALTER TABLE payment_proofs DROP COLUMN IF EXISTS sender_document`);
    await q.query(`ALTER TABLE payment_proofs DROP COLUMN IF EXISTS sender_name`);
  },
};
