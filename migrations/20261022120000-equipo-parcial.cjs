'use strict';

/**
 * `jobs.partial_start_allowed`: un trabajo para varios trabajadores puede empezar con menos de los pedidos (1 de 2) si el dueño lo permitió al crearlo.
 * Por defecto sí (es lo que ya pasaba). Idempotente: también la repite `ensureCriticalSchema`.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS partial_start_allowed BOOLEAN NOT NULL DEFAULT true`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS partial_start_allowed`);
  },
};
