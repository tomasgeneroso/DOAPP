'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'dni_photo_front', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'dni_photo_back', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'dni_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'dni_photo_front');
    await queryInterface.removeColumn('users', 'dni_photo_back');
    await queryInterface.removeColumn('users', 'dni_verified');
  },
};
