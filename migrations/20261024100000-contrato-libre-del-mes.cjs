'use strict';

/**
 * `users.free_monthly_used_at`: cuándo gastó una cuenta de las primeras 1000 su contrato libre de comisión del mes (regla del dueño del 2026-10-24:
 * 1 por mes durante un año). Idempotente: también la repite `ensureCriticalSchema`.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_monthly_used_at TIMESTAMPTZ`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE users DROP COLUMN IF EXISTS free_monthly_used_at`);
  },
};
