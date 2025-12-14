'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Rename reminder columns to match Sequelize's underscored naming convention
    // Sequelize converts reminder12hSent -> reminder12h_sent (not reminder_12h_sent)
    await queryInterface.renameColumn('jobs', 'reminder_12h_sent', 'reminder12h_sent');
    await queryInterface.renameColumn('jobs', 'reminder_6h_sent', 'reminder6h_sent');
    await queryInterface.renameColumn('jobs', 'reminder_2h_sent', 'reminder2h_sent');
  },

  async down(queryInterface, Sequelize) {
    // Revert column names
    await queryInterface.renameColumn('jobs', 'reminder12h_sent', 'reminder_12h_sent');
    await queryInterface.renameColumn('jobs', 'reminder6h_sent', 'reminder_6h_sent');
    await queryInterface.renameColumn('jobs', 'reminder2h_sent', 'reminder_2h_sent');
  }
};
