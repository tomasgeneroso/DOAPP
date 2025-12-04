'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('payments');

    // Add platform_fee column if it doesn't exist
    if (!tableInfo.platform_fee) {
      await queryInterface.addColumn('payments', 'platform_fee', {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false
      });
    }

    // Add platform_fee_percentage column if it doesn't exist
    if (!tableInfo.platform_fee_percentage) {
      await queryInterface.addColumn('payments', 'platform_fee_percentage', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0,
        allowNull: false
      });
    }
  },

  async down (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('payments');

    if (tableInfo.platform_fee) {
      await queryInterface.removeColumn('payments', 'platform_fee');
    }

    if (tableInfo.platform_fee_percentage) {
      await queryInterface.removeColumn('payments', 'platform_fee_percentage');
    }
  }
};
