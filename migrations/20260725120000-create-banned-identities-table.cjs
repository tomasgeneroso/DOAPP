'use strict';

/**
 * Permanent record of the email + DNI of banned users, kept for the app's
 * history independently of the users row (no FK — survives account deletion).
 * Used to block re-registration with the same identity. Idempotent.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS banned_identities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        dni VARCHAR(255),
        user_id UUID,
        name VARCHAR(255),
        reason TEXT NOT NULL,
        banned_by UUID,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS banned_identities_email ON banned_identities (email)`
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS banned_identities_dni ON banned_identities (dni)`
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('banned_identities').catch(() => {});
  },
};
