'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('jobs', 'vacancy_task_assignments', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('jobs', 'vacancy_task_assignments');
  },
};
