'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('contracts', 'client_pairing_latitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn('contracts', 'client_pairing_longitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn('contracts', 'doer_pairing_latitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn('contracts', 'doer_pairing_longitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn('contracts', 'pairing_distance_meters', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('contracts', 'location_verification_status', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'pending',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('contracts', 'client_pairing_latitude');
    await queryInterface.removeColumn('contracts', 'client_pairing_longitude');
    await queryInterface.removeColumn('contracts', 'doer_pairing_latitude');
    await queryInterface.removeColumn('contracts', 'doer_pairing_longitude');
    await queryInterface.removeColumn('contracts', 'pairing_distance_meters');
    await queryInterface.removeColumn('contracts', 'location_verification_status');
  },
};
