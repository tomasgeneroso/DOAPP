'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add payment method details to payments table
    // This stores card brand, last 4 digits, and payment type from MercadoPago

    await queryInterface.addColumn('payments', 'payment_type_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'credit_card, debit_card, bank_transfer, account_money, etc.'
    });

    await queryInterface.addColumn('payments', 'payment_method_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'visa, master, amex, etc.'
    });

    await queryInterface.addColumn('payments', 'card_last_four_digits', {
      type: Sequelize.STRING(4),
      allowNull: true,
      comment: 'Last 4 digits of the card'
    });

    await queryInterface.addColumn('payments', 'card_brand', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Visa, Mastercard, American Express, etc.'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payments', 'payment_type_id');
    await queryInterface.removeColumn('payments', 'payment_method_id');
    await queryInterface.removeColumn('payments', 'card_last_four_digits');
    await queryInterface.removeColumn('payments', 'card_brand');
  }
};
