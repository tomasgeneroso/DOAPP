'use strict';

/**
 * Counts Didit sessions that came back Declined.
 *
 * Identity verification is Didit-only; the manual document upload is unlocked
 * exclusively once this counter reaches the configured maximum, so a user the
 * automated flow cannot process still has a way to prove who they are.
 *
 * Idempotent: safe to re-run and safe against ensureCriticalSchema having
 * already created the column on boot.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.kyc_attempts) {
      await queryInterface.addColumn('users', 'kyc_attempts', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.kyc_attempts) {
      await queryInterface.removeColumn('users', 'kyc_attempts');
    }
  },
};
