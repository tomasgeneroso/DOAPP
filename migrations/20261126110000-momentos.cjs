'use strict';

/**
 * Momentos importantes (2026-11-26): user_moments = qué cartel o tarjeta vio cada persona; before_after_shares = pedido de publicar el antes y después de un
 * contrato, con quién lo propuso y quién respondió. Quienes YA tienen cuenta quedan sin marca a propósito: así ven una vez el aviso del cambio de políticas.
 * Espejo en server/config/ensureSchema.ts. Aditiva: el código anterior las ignora.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("CREATE TABLE IF NOT EXISTS user_moments (user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, moment_key VARCHAR(80) NOT NULL, seen_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, moment_key))");
    await queryInterface.sequelize.query("CREATE TABLE IF NOT EXISTS before_after_shares (id UUID PRIMARY KEY, contract_id UUID NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE, proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(20) NOT NULL DEFAULT 'pending', photos JSONB NOT NULL, caption VARCHAR(300), answered_by UUID, answered_at TIMESTAMPTZ, post_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS before_after_shares');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS user_moments');
  },
};
