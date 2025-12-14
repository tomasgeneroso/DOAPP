'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if extension_history column exists
    const [extensionHistoryExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'extension_history'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!extensionHistoryExists) {
      await queryInterface.addColumn('contracts', 'extension_history', {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: true,
      });
      console.log('Added extension_history column to contracts table');
    } else {
      console.log('extension_history column already exists');
    }

    // Check if extension_count column exists
    const [extensionCountExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'extension_count'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!extensionCountExists) {
      await queryInterface.addColumn('contracts', 'extension_count', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
      });
      console.log('Added extension_count column to contracts table');
    } else {
      console.log('extension_count column already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('contracts', 'extension_history');
    await queryInterface.removeColumn('contracts', 'extension_count');
  }
};
