'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('jobs');

    // Add permanently_cancelled column if it doesn't exist
    if (!tableInfo.permanently_cancelled) {
      await queryInterface.addColumn('jobs', 'permanently_cancelled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
  },

  async down (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('jobs');

    if (tableInfo.permanently_cancelled) {
      await queryInterface.removeColumn('jobs', 'permanently_cancelled');
    }
  }
};
