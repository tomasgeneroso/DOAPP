'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add endDateFlexible field
    await queryInterface.addColumn('jobs', 'end_date_flexible', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    // Make endDate nullable
    await queryInterface.changeColumn('jobs', 'end_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove endDateFlexible field
    await queryInterface.removeColumn('jobs', 'end_date_flexible');

    // Revert endDate to non-nullable (set default for existing nulls first)
    await queryInterface.sequelize.query(
      `UPDATE jobs SET end_date = start_date + INTERVAL '1 day' WHERE end_date IS NULL`
    );
    await queryInterface.changeColumn('jobs', 'end_date', {
      type: Sequelize.DATE,
      allowNull: false,
    });
  }
};
