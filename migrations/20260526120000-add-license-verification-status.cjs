'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('users');

    if (!tableDesc.license_verification_status) {
      await queryInterface.addColumn('users', 'license_verification_status', {
        type: Sequelize.STRING(20),
        defaultValue: 'pending',
        allowNull: true,
      });
    }

    if (!tableDesc.license_rejected_reason) {
      await queryInterface.addColumn('users', 'license_rejected_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!tableDesc.license_verified_by) {
      await queryInterface.addColumn('users', 'license_verified_by', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    if (!tableDesc.license_verified_at) {
      await queryInterface.addColumn('users', 'license_verified_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'license_verification_status');
    await queryInterface.removeColumn('users', 'license_rejected_reason');
    await queryInterface.removeColumn('users', 'license_verified_by');
    await queryInterface.removeColumn('users', 'license_verified_at');
  },
};
