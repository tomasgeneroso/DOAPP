'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'pending_verification', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'If true, payment status is pending_verification (not just pending)'
    });

    await queryInterface.addColumn('payments', 'mercadopago_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When MercadoPago payment was received (before admin approval)'
    });

    await queryInterface.addColumn('payments', 'approved_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Admin who approved this payment'
    });

    await queryInterface.addColumn('payments', 'approved_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When admin approved this payment'
    });

    await queryInterface.addColumn('payments', 'admin_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Admin notes for this payment (approval/rejection reasons)'
    });

    await queryInterface.addColumn('payments', 'paid_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When payment was actually paid (for tracking purposes)'
    });

    // Add index for admin queries
    await queryInterface.addIndex('payments', ['pending_verification', 'status'], {
      name: 'payments_pending_verification_status_idx'
    });

    await queryInterface.addIndex('payments', ['approved_by'], {
      name: 'payments_approved_by_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('payments', 'payments_approved_by_idx');
    await queryInterface.removeIndex('payments', 'payments_pending_verification_status_idx');
    await queryInterface.removeColumn('payments', 'paid_at');
    await queryInterface.removeColumn('payments', 'admin_notes');
    await queryInterface.removeColumn('payments', 'approved_at');
    await queryInterface.removeColumn('payments', 'approved_by');
    await queryInterface.removeColumn('payments', 'mercadopago_verified_at');
    await queryInterface.removeColumn('payments', 'pending_verification');
  }
};
