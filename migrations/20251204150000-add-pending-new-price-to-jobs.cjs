'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('jobs');

    // Add pending_new_price column if it doesn't exist
    if (!tableInfo.pending_new_price) {
      await queryInterface.addColumn('jobs', 'pending_new_price', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      });
    }

    // Add previous_status column if it doesn't exist
    if (!tableInfo.previous_status) {
      await queryInterface.addColumn('jobs', 'previous_status', {
        type: Sequelize.STRING(50),
        allowNull: true
      });
    }
  },

  async down (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('jobs');

    if (tableInfo.pending_new_price) {
      await queryInterface.removeColumn('jobs', 'pending_new_price');
    }

    if (tableInfo.previous_status) {
      await queryInterface.removeColumn('jobs', 'previous_status');
    }
  }
};
