'use strict';

/**
 * Consentimiento para publicar las fotos del trabajo (pedido del dueño, 2026-11-26, T&C 6.8): `contracts.photo_consent_at`. Se completa al crear el contrato;
 * los contratos anteriores quedan en NULL (nada retroactivo: en esos se publica solo si las dos partes lo aceptan). Idempotente (también la crea `ensureSchema`).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS photo_consent_at TIMESTAMPTZ`);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS photo_consent_at`);
  },
};
