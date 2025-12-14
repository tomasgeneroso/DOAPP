'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add data field to notifications table
    await queryInterface.addColumn('notifications', 'data', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('notifications', 'data');
  }
};
