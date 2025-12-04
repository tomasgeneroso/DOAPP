'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Check if column already exists
    const tableInfo = await queryInterface.describeTable('jobs');

    if (!tableInfo.pending_payment_amount) {
      await queryInterface.addColumn('jobs', 'pending_payment_amount', {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false
      });
    }
  },

  async down (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('jobs');

    if (tableInfo.pending_payment_amount) {
      await queryInterface.removeColumn('jobs', 'pending_payment_amount');
    }
  }
};
