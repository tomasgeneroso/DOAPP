'use strict';

/**
 * Adds an indexed `bank_reference` (nº de operación / ID de transacción) to
 * payment_proofs so we can detect a reference being reused across different
 * payments (fraud: same transfer claimed for two jobs). Deduping keys on the
 * reference, NOT the amount (two different jobs may legitimately share an amount).
 * Idempotent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'payment_proofs';
    const desc = await queryInterface.describeTable(table).catch(() => ({}));
    if (!desc.bank_reference) {
      await queryInterface.addColumn(table, 'bank_reference', {
        type: Sequelize.STRING(120),
        allowNull: true,
      });
    }
    const indexes = await queryInterface.showIndex(table).catch(() => []);
    const hasIdx = Array.isArray(indexes) && indexes.some((i) => i.name === 'payment_proofs_bank_reference');
    if (!hasIdx) {
      await queryInterface.addIndex(table, ['bank_reference'], { name: 'payment_proofs_bank_reference' }).catch(() => {});
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payment_proofs', 'payment_proofs_bank_reference').catch(() => {});
    await queryInterface.removeColumn('payment_proofs', 'bank_reference').catch(() => {});
  },
};
