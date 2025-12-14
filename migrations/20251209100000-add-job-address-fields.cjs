'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check and add address_street column
    const [streetExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'address_street'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!streetExists) {
      await queryInterface.addColumn('jobs', 'address_street', {
        type: Sequelize.STRING(200),
        allowNull: true,
      });
      console.log('Added address_street column to jobs table');
    } else {
      console.log('address_street column already exists');
    }

    // Check and add address_number column
    const [numberExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'address_number'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!numberExists) {
      await queryInterface.addColumn('jobs', 'address_number', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
      console.log('Added address_number column to jobs table');
    } else {
      console.log('address_number column already exists');
    }

    // Check and add address_details column
    const [detailsExists] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'address_details'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!detailsExists) {
      await queryInterface.addColumn('jobs', 'address_details', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
      console.log('Added address_details column to jobs table');
    } else {
      console.log('address_details column already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobs', 'address_street');
    await queryInterface.removeColumn('jobs', 'address_number');
    await queryInterface.removeColumn('jobs', 'address_details');
  }
};
