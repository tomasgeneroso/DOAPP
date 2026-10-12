'use strict';

/**
 * Invitaciones de creadores de contenido: cada una es un enlace de un solo uso que, al canjearse, exime de comisión a la
 * cuenta que la canjea durante `free_days` días corridos (T&C 7.11).
 *
 * - influencer_invites: una fila por invitación (un lote de 5 por creador, mismo batch_id).
 * - users.commission_free_until: hasta cuándo no paga comisión como Cliente (la lee commissionService).
 * - users.influencer_invite_id: la invitación que canjeó (una por cuenta).
 *
 * Idempotente: IF NOT EXISTS en todo.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS influencer_invites (
        id UUID PRIMARY KEY,
        code VARCHAR(24) NOT NULL,
        batch_id UUID NOT NULL,
        influencer_name VARCHAR(120) NOT NULL,
        influencer_handle VARCHAR(160),
        free_days INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        expires_at TIMESTAMPTZ,
        redeemed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        redeemed_at TIMESTAMPTZ,
        benefit_ends_at TIMESTAMPTZ,
        created_by_id UUID NOT NULL REFERENCES users(id),
        notes TEXT,
        deactivated_reason TEXT,
        deactivated_at TIMESTAMPTZ,
        deactivated_by_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS influencer_invites_code_unique ON influencer_invites (code);
      CREATE INDEX IF NOT EXISTS influencer_invites_batch_id ON influencer_invites (batch_id);
      CREATE INDEX IF NOT EXISTS influencer_invites_redeemed_by_id ON influencer_invites (redeemed_by_id);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_free_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS influencer_invite_id UUID;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS influencer_invite_id;
      ALTER TABLE users DROP COLUMN IF EXISTS commission_free_until;
      DROP TABLE IF EXISTS influencer_invites;
    `);
  },
};
