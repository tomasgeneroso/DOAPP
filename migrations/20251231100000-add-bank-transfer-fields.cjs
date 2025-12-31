'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add bank transfer fields to payment_proofs table
    await queryInterface.addColumn('payment_proofs', 'is_own_bank_account', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true,
      comment: 'Whether the bank account belongs to the user or a third party',
    });

    await queryInterface.addColumn('payment_proofs', 'third_party_account_holder', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Name of the third party account holder if is_own_bank_account is false',
    });

    await queryInterface.addColumn('payment_proofs', 'sender_bank_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Name of the bank from which the transfer was made',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payment_proofs', 'is_own_bank_account');
    await queryInterface.removeColumn('payment_proofs', 'third_party_account_holder');
    await queryInterface.removeColumn('payment_proofs', 'sender_bank_name');
  }
};
