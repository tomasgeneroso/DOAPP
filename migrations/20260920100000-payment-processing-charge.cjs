'use strict';

/**
 * payments.processing_charge: lo que se le cobro al CLIENTE por procesamiento
 * del pago (sin IVA). Distinto de processing_fee, que es lo que MP cobro de
 * verdad (con IVA): uno es ingreso, el otro costo, y la conciliacion compara
 * los dos.
 *
 * jobs.pending_balance_deduction: la parte de un aumento de precio que se
 * cubre con saldo a favor, reservada hasta que se acredita el pago del resto.
 * El codigo la escribia desde siempre pero la columna no existia, asi que se
 * perdia y el saldo nunca se debitaba.
 *
 * Idempotente: IF NOT EXISTS, y ensureCriticalSchema la repite al arrancar.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS processing_charge NUMERIC(12,2);
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pending_balance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE payments DROP COLUMN IF EXISTS processing_charge;
      ALTER TABLE jobs DROP COLUMN IF EXISTS pending_balance_deduction;
    `);
  },
};
