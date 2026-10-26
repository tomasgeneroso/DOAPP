'use strict';

/**
 * `users.free_monthly_pro_used_at`: cuándo gastó una cuenta con PRO vigente su contrato libre de comisión del mes (regla del dueño, 2026-10-26: se SUMA al de las
 * primeras cuentas, que tiene su propia fecha en `free_monthly_used_at`). Sin cron: el mes que no se usa se pierde y se calcula con esta fecha.
 * Idempotente; espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS free_monthly_pro_used_at TIMESTAMPTZ');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS free_monthly_pro_used_at');
  },
};
