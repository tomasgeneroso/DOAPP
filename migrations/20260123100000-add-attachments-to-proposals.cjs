'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('proposals', 'attachments', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('proposals', 'attachments');
  }
};
