'use strict';

/**
 * Fotos de entrega del contrato (pedido del dueño, 2026-11-13): `contracts.delivery_photos`, una lista de fotos con quién las subió y cuándo.
 * Idempotente (también la crea `ensureSchema`).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS delivery_photos JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS delivery_photos`);
  },
};
