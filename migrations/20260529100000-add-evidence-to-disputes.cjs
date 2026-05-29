'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('disputes');

    if (!tableInfo.evidence) {
      await queryInterface.addColumn('disputes', 'evidence', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('disputes');
    if (tableInfo.evidence) {
      await queryInterface.removeColumn('disputes', 'evidence');
    }
  },
};
