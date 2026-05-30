'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS blacklist_entries (
        id             UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_by       UUID          NOT NULL REFERENCES users(id),
        type           VARCHAR(50)   NOT NULL,
        severity       VARCHAR(20)   NOT NULL DEFAULT 'medium',
        reason         TEXT          NOT NULL,
        is_active      BOOLEAN       NOT NULL DEFAULT true,
        auto_added     BOOLEAN       NOT NULL DEFAULT false,
        expires_at     TIMESTAMPTZ,
        resolved_at    TIMESTAMPTZ,
        resolved_by    UUID          REFERENCES users(id),
        resolution_notes TEXT,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS blacklist_entries_user_id    ON blacklist_entries (user_id);
      CREATE INDEX IF NOT EXISTS blacklist_entries_is_active  ON blacklist_entries (is_active);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blacklist_entries');
  },
};
