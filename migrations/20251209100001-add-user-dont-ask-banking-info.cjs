'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if dont_ask_banking_info column exists
    const [columnExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'dont_ask_banking_info'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!columnExists) {
      await queryInterface.addColumn('users', 'dont_ask_banking_info', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
      console.log('Added dont_ask_banking_info column to users table');
    } else {
      console.log('dont_ask_banking_info column already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'dont_ask_banking_info');
  }
};
