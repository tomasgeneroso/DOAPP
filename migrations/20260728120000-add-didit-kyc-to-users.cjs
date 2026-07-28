'use strict';

/**
 * Didit KYC fields on users: session id + status + verified timestamp.
 * Approval sets the existing dni_verified=true (credibility ladder level 1).
 * Idempotent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'users';
    const desc = await queryInterface.describeTable(table).catch(() => ({}));
    const add = async (name, def) => {
      if (!desc[name]) await queryInterface.addColumn(table, name, def).catch(() => {});
    };
    await add('didit_session_id', { type: Sequelize.STRING, allowNull: true });
    await add('kyc_status', { type: Sequelize.STRING(20), allowNull: true });
    await add('kyc_verified_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    for (const c of ['didit_session_id', 'kyc_status', 'kyc_verified_at']) {
      await queryInterface.removeColumn('users', c).catch(() => {});
    }
  },
};
