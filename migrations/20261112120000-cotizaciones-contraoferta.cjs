'use strict';

/**
 * Contraoferta de una cotización (pedido del dueño, 2026-11-12): quien recibe la cotización puede responder con otro monto en vez de solo aceptar o rechazar.
 * El monto es un TOTAL (el mismo que muestra la cotización). Idempotente: espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS counter_offer_amount NUMERIC(12,2);
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS counter_offer_note TEXT;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE quotes DROP COLUMN IF EXISTS counter_offer_amount;
      ALTER TABLE quotes DROP COLUMN IF EXISTS counter_offer_note;
    `);
  },
};
