'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS profession            VARCHAR(100),
        ADD COLUMN IF NOT EXISTS license_number        VARCHAR(100),
        ADD COLUMN IF NOT EXISTS license_category      VARCHAR(100),
        ADD COLUMN IF NOT EXISTS license_cert_number   VARCHAR(100),
        ADD COLUMN IF NOT EXISTS license_document_url  TEXT,
        ADD COLUMN IF NOT EXISTS license_verified      BOOLEAN NOT NULL DEFAULT false
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_profession ON users (profession)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_users_profession`);
    await queryInterface.sequelize.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS license_verified,
        DROP COLUMN IF EXISTS license_document_url,
        DROP COLUMN IF EXISTS license_cert_number,
        DROP COLUMN IF EXISTS license_category,
        DROP COLUMN IF EXISTS license_number,
        DROP COLUMN IF EXISTS profession
    `);
  },
};
