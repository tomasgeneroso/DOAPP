'use strict';

/**
 * Adds the fields backing the profile credibility ladder:
 *   - phone verification (code sent by WhatsApp, pasted back by the user)
 *   - selfie_url (front-camera selfie for identity matching)
 *   - insurance (seguro) document + admin verification, mirroring the license flow
 * Idempotent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'users';
    const desc = await queryInterface.describeTable(table).catch(() => ({}));
    const add = async (name, def) => {
      if (!desc[name]) await queryInterface.addColumn(table, name, def).catch(() => {});
    };

    // Phone verification
    await add('phone_verified', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await add('phone_verified_at', { type: Sequelize.DATE, allowNull: true });
    await add('phone_verification_code', { type: Sequelize.STRING(10), allowNull: true });
    await add('phone_verification_expires', { type: Sequelize.DATE, allowNull: true });

    // Selfie
    await add('selfie_url', { type: Sequelize.TEXT, allowNull: true });

    // Insurance (seguro)
    await add('insurance_document_url', { type: Sequelize.TEXT, allowNull: true });
    await add('insurance_verified', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await add('insurance_verification_status', { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'pending' });
    await add('insurance_rejected_reason', { type: Sequelize.TEXT, allowNull: true });
    await add('insurance_verified_by', { type: Sequelize.UUID, allowNull: true });
    await add('insurance_verified_at', { type: Sequelize.DATE, allowNull: true });
    await add('insurance_expires_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    const cols = [
      'phone_verified', 'phone_verified_at', 'phone_verification_code', 'phone_verification_expires',
      'selfie_url',
      'insurance_document_url', 'insurance_verified', 'insurance_verification_status',
      'insurance_rejected_reason', 'insurance_verified_by', 'insurance_verified_at', 'insurance_expires_at',
    ];
    for (const c of cols) {
      await queryInterface.removeColumn('users', c).catch(() => {});
    }
  },
};
