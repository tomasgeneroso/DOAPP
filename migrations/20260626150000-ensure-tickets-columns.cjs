'use strict';

/**
 * Fixes runtime error: `column Ticket.created_by does not exist`.
 *
 * The `tickets` table is created by `sequelize.sync()`, and prod runs with
 * `alter: false`, so columns added to the Ticket model after the table was first
 * synced (the relationship/metadata block: created_by, assigned_to, etc.) were
 * never added to existing databases. This idempotently ensures every Ticket
 * column exists (ADD COLUMN IF NOT EXISTS is a no-op when present).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS ticket_number    VARCHAR(20),
        ADD COLUMN IF NOT EXISTS subject          VARCHAR(200),
        ADD COLUMN IF NOT EXISTS category         VARCHAR(30),
        ADD COLUMN IF NOT EXISTS priority         VARCHAR(20)     DEFAULT 'medium',
        ADD COLUMN IF NOT EXISTS status           VARCHAR(20)     DEFAULT 'open',
        ADD COLUMN IF NOT EXISTS created_by       UUID,
        ADD COLUMN IF NOT EXISTS assigned_to      UUID,
        ADD COLUMN IF NOT EXISTS related_user     UUID,
        ADD COLUMN IF NOT EXISTS related_contract UUID,
        ADD COLUMN IF NOT EXISTS messages         JSONB           DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS tags             VARCHAR(255)[]  DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS resolution       TEXT,
        ADD COLUMN IF NOT EXISTS closed_at        TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS closed_by        UUID,
        ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ     DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ     DEFAULT now()
    `);
    // Index declared on the model for the most common query (by creator + status)
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS tickets_created_by_status ON tickets (created_by, status)
    `);
  },

  async down() {
    // No-op: additive, idempotent. Dropping columns could destroy ticket data.
  },
};
