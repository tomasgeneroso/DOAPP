'use strict';

/**
 * Portafolio: la puntuación que se dejó a cada trabajador al terminar el trabajo (pedido del dueño, 2026-11-23): `portfolio_items.contract_ratings`, una lista de
 * {quién, puntaje, comentario}. Las arma el servidor desde las reseñas reales. Idempotente (también la crea `ensureSchema`).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS contract_ratings JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE portfolio_items DROP COLUMN IF EXISTS contract_ratings`);
  },
};
