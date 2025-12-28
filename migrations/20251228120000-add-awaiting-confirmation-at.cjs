'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add awaiting_confirmation_at field to contracts table
    // This tracks when a contract entered awaiting_confirmation status
    // Used for auto-confirm after 2 hours
    await queryInterface.addColumn('contracts', 'awaiting_confirmation_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('contracts', 'awaiting_confirmation_at');
  }
};
