'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add escrow verification fields to payments table
    await queryInterface.addColumn('payments', 'escrow_verified_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('payments', 'escrow_verified_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    console.log('✅ Added escrow_verified_by and escrow_verified_at columns to payments table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payments', 'escrow_verified_by');
    await queryInterface.removeColumn('payments', 'escrow_verified_at');

    console.log('✅ Removed escrow_verified_by and escrow_verified_at columns from payments table');
  }
};
