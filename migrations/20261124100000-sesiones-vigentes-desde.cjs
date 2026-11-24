'use strict';

/**
 * users.tokens_valid_after: desde cuándo valen los tokens de sesión (auditoría de seguridad, 2026-11-24).
 * «Cerrar todas las sesiones», restablecer la contraseña y cambiarla ponen la fecha en «ahora»: un token emitido antes deja de servir.
 * Espejo en server/config/ensureSchema.ts. Aditiva: el código anterior la ignora.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS tokens_valid_after');
  },
};
