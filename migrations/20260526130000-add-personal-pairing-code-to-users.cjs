'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('users');
    if (!tableDesc.personal_pairing_code) {
      await queryInterface.addColumn('users', 'personal_pairing_code', {
        type: Sequelize.STRING(8),
        allowNull: true,
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'personal_pairing_code');
  },
};
