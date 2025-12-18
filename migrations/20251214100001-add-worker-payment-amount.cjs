'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add workerPaymentAmount field for multi-worker payments
    await queryInterface.addColumn('payments', 'worker_payment_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payments', 'worker_payment_amount');
  }
};
