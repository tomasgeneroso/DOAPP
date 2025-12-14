'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add maxWorkers field to jobs table
    await queryInterface.addColumn('jobs', 'max_workers', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
        max: 5,
      },
    });

    // Add selectedWorkers array field to jobs table
    await queryInterface.addColumn('jobs', 'selected_workers', {
      type: Sequelize.ARRAY(Sequelize.UUID),
      allowNull: false,
      defaultValue: [],
    });

    // Add groupChatId field to jobs table
    await queryInterface.addColumn('jobs', 'group_chat_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // Add reminder notification flags
    await queryInterface.addColumn('jobs', 'reminder_12h_sent', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('jobs', 'reminder_6h_sent', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('jobs', 'reminder_2h_sent', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobs', 'max_workers');
    await queryInterface.removeColumn('jobs', 'selected_workers');
    await queryInterface.removeColumn('jobs', 'group_chat_id');
    await queryInterface.removeColumn('jobs', 'reminder_12h_sent');
    await queryInterface.removeColumn('jobs', 'reminder_6h_sent');
    await queryInterface.removeColumn('jobs', 'reminder_2h_sent');
  }
};
