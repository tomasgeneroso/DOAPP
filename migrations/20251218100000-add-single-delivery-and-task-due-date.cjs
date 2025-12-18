'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add singleDelivery to jobs table
    await queryInterface.addColumn('jobs', 'single_delivery', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    });

    // Add dueDate to job_tasks table (optional - only used as guide when singleDelivery is false)
    await queryInterface.addColumn('job_tasks', 'due_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add responseDeadline and priority calculation fields to disputes
    await queryInterface.addColumn('disputes', 'response_deadline', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('disputes', 'escalated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('disputes', 'auto_priority_reason', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobs', 'single_delivery');
    await queryInterface.removeColumn('job_tasks', 'due_date');
    await queryInterface.removeColumn('disputes', 'response_deadline');
    await queryInterface.removeColumn('disputes', 'escalated_at');
    await queryInterface.removeColumn('disputes', 'auto_priority_reason');
  }
};
