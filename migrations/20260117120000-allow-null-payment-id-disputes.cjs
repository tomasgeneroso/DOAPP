'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if payment_id column exists
    const tableInfo = await queryInterface.describeTable('disputes');

    if (!tableInfo.payment_id) {
      // Add the column if it doesn't exist
      await queryInterface.addColumn('disputes', 'payment_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'payments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    } else {
      // Change the column if it exists
      await queryInterface.changeColumn('disputes', 'payment_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'payments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the column
    const tableInfo = await queryInterface.describeTable('disputes');
    if (tableInfo.payment_id) {
      await queryInterface.removeColumn('disputes', 'payment_id');
    }
  }
};
