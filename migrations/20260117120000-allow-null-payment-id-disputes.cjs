'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Allow null for payment_id in disputes table
    // This enables creating disputes for contracts that don't have associated payments
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
  },

  async down(queryInterface, Sequelize) {
    // Revert to not allowing null
    await queryInterface.changeColumn('disputes', 'payment_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'payments',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  }
};
