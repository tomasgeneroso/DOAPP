'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('jobs', 'completion_requirements', {
      type: Sequelize.ARRAY(Sequelize.TEXT),
      defaultValue: [],
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('jobs', 'completion_requirements');
  }
};
