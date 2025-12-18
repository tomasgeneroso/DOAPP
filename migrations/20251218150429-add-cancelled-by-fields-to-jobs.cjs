'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add cancelledById field
    await queryInterface.addColumn('jobs', 'cancelled_by_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // Add cancelledByRole field
    await queryInterface.addColumn('jobs', 'cancelled_by_role', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobs', 'cancelled_by_id');
    await queryInterface.removeColumn('jobs', 'cancelled_by_role');
  }
};
