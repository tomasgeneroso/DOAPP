'use strict';

/**
 * El trabajador pide el cobro de un contrato terminado (pedido del dueño, 2026-11-13): `contracts.payout_requested_at` guarda cuándo lo pidió. Solo se puede pedir
 * cuando el pago ya está liberado; el pago lo sigue haciendo el equipo (Pagos a trabajadores). Idempotente: espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payout_requested_at TIMESTAMPTZ;`);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS payout_requested_at;`);
  },
};
