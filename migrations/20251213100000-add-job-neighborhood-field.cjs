'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add neighborhood field to jobs table
    await queryInterface.addColumn('jobs', 'neighborhood', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobs', 'neighborhood');
  }
};
