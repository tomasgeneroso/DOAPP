'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.availability_schedule) {
      await queryInterface.addColumn('users', 'availability_schedule', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!tableDescription.is_availability_public) {
      await queryInterface.addColumn('users', 'is_availability_public', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'availability_schedule');
    await queryInterface.removeColumn('users', 'is_availability_public');
  },
};
