'use strict';

/**
 * El cliente pidio cancelar mientras la publicacion esperaba aprobacion.
 * Idempotente; espejada en ensureCriticalSchema.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE jobs DROP COLUMN IF EXISTS cancellation_requested_at;
    `);
  },
};
