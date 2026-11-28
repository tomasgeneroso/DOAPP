'use strict';

/**
 * Pedido del 2026-11-27: con alguien ya elegido, el cambio de presupuesto queda como un PEDIDO (quién tiene que aceptar y con qué monto) y se aplica recién cuando todos aceptan.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget_change_request JSONB');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE jobs DROP COLUMN IF EXISTS budget_change_request');
  },
};
