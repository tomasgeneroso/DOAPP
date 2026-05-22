'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'profession', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'license_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'license_category', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'license_cert_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'license_document_url', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'license_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    await queryInterface.addIndex('users', ['profession'], { name: 'idx_users_profession' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'idx_users_profession');
    await queryInterface.removeColumn('users', 'license_verified');
    await queryInterface.removeColumn('users', 'license_document_url');
    await queryInterface.removeColumn('users', 'license_cert_number');
    await queryInterface.removeColumn('users', 'license_category');
    await queryInterface.removeColumn('users', 'license_number');
    await queryInterface.removeColumn('users', 'profession');
  },
};
