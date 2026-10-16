'use strict';

/** Contratos libres de comisión: se gasta un cupo una sola vez por trabajo. Espejo de server/config/ensureSchema.ts. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS commission_free_applied BOOLEAN NOT NULL DEFAULT false');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE jobs DROP COLUMN IF EXISTS commission_free_applied');
  },
};
