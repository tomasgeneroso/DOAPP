'use strict';

/**
 * Adds classification + provenance columns to payment_proofs so we can store
 * "notas de comprobante de pago" alongside the real receipts:
 *   - kind: 'client_receipt' | 'admin_verification' | 'note'
 *   - sequence: upload order for a given payment (1st, 2nd, ...)
 *   - uploaded_by_role: 'client' | 'admin'  (who uploaded it)
 * Idempotent: safe to run on a DB where the columns may already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'payment_proofs';
    const desc = await queryInterface.describeTable(table).catch(() => ({}));

    if (!desc.kind) {
      await queryInterface.addColumn(table, 'kind', {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'client_receipt',
      });
    }
    if (!desc.sequence) {
      await queryInterface.addColumn(table, 'sequence', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    if (!desc.uploaded_by_role) {
      await queryInterface.addColumn(table, 'uploaded_by_role', {
        type: Sequelize.STRING(16),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    for (const col of ['kind', 'sequence', 'uploaded_by_role']) {
      await queryInterface.removeColumn('payment_proofs', col).catch(() => {});
    }
  },
};
