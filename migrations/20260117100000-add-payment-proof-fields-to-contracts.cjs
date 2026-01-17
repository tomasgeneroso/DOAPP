'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add payment proof and admin verification fields to contracts
    await queryInterface.addColumn('contracts', 'payment_proof_url', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('contracts', 'payment_processed_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    });

    await queryInterface.addColumn('contracts', 'payment_processed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('contracts', 'payment_admin_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('contracts', 'payment_proof_url');
    await queryInterface.removeColumn('contracts', 'payment_processed_by');
    await queryInterface.removeColumn('contracts', 'payment_processed_at');
    await queryInterface.removeColumn('contracts', 'payment_admin_notes');
  }
};
