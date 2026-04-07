'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add archived column if not exists
    const tableDesc = await queryInterface.describeTable('conversations').catch(() => null);

    if (tableDesc && !tableDesc.archived) {
      await queryInterface.addColumn('conversations', 'archived', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }

    if (tableDesc && !tableDesc.archived_by) {
      await queryInterface.addColumn('conversations', 'archived_by', {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: [],
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('conversations', 'archived').catch(() => {});
    await queryInterface.removeColumn('conversations', 'archived_by').catch(() => {});
  }
};
