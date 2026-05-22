'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('users');
    if (!cols.verification_token) {
      await queryInterface.addColumn('users', 'verification_token', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!cols.verification_token_expiry) {
      await queryInterface.addColumn('users', 'verification_token_expiry', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('users');
    if (cols.verification_token) await queryInterface.removeColumn('users', 'verification_token');
    if (cols.verification_token_expiry) await queryInterface.removeColumn('users', 'verification_token_expiry');
  },
};
