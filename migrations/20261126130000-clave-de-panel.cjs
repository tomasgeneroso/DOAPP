'use strict';

/**
 * Clave de panel (pedido del dueño, 2026-11-26): cada persona con un rol tiene, además de la contraseña de su cuenta, una clave generada por el sistema para
 * ejercer ese rol. Se guarda solo su hash. Espejo en server/config/ensureSchema.ts. Aditiva: el código anterior la ignora.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("CREATE TABLE IF NOT EXISTS admin_panel_keys (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, key_hash VARCHAR(100), stamp VARCHAR(32), failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ, reset_code_hash VARCHAR(64), reset_expires_at TIMESTAMPTZ, key_set_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS admin_panel_keys');
  },
};
