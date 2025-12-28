'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add metadata field to conversations table
    await queryInterface.addColumn('conversations', 'metadata', {
      type: Sequelize.JSONB,
      defaultValue: {},
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('conversations', 'metadata');
  }
};
