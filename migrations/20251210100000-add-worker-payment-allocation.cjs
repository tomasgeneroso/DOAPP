'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add allocatedAmount to contracts - specific amount allocated to this worker
    const [allocatedExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'allocated_amount'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!allocatedExists) {
      await queryInterface.addColumn('contracts', 'allocated_amount', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true, // null means use the default price
      });
      console.log('Added allocated_amount column to contracts table');
    } else {
      console.log('allocated_amount column already exists');
    }

    // Add percentage field for display purposes
    const [percentageExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'percentage_of_budget'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!percentageExists) {
      await queryInterface.addColumn('contracts', 'percentage_of_budget', {
        type: Sequelize.DECIMAL(5, 2), // 0.00 to 100.00
        allowNull: true,
      });
      console.log('Added percentage_of_budget column to contracts table');
    } else {
      console.log('percentage_of_budget column already exists');
    }

    // Add worker_allocations JSONB to jobs - stores all worker payment info
    const [allocationsExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'worker_allocations'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!allocationsExists) {
      await queryInterface.addColumn('jobs', 'worker_allocations', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of {workerId, allocatedAmount, percentage} for each selected worker'
      });
      console.log('Added worker_allocations column to jobs table');
    } else {
      console.log('worker_allocations column already exists');
    }

    // Add allocated_total to jobs - sum of all allocated amounts
    const [totalExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'allocated_total'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!totalExists) {
      await queryInterface.addColumn('jobs', 'allocated_total', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      });
      console.log('Added allocated_total column to jobs table');
    } else {
      console.log('allocated_total column already exists');
    }

    // Add remaining_budget to jobs - budget left to allocate
    const [remainingExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'remaining_budget'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!remainingExists) {
      await queryInterface.addColumn('jobs', 'remaining_budget', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      });
      console.log('Added remaining_budget column to jobs table');
    } else {
      console.log('remaining_budget column already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('contracts', 'allocated_amount');
    await queryInterface.removeColumn('contracts', 'percentage_of_budget');
    await queryInterface.removeColumn('jobs', 'worker_allocations');
    await queryInterface.removeColumn('jobs', 'allocated_total');
    await queryInterface.removeColumn('jobs', 'remaining_budget');
  }
};
