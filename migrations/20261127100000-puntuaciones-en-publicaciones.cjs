'use strict';

/**
 * Compartir un trabajo pasa a ser UNA publicación del perfil (pedido del dueño, 2026-11-27: la pestaña Portfolio sobra). Las puntuaciones que se eligen mostrar,
 * que vivían en el portafolio, van ahora en la publicación. Idempotente (también la crea `ensureSchema`). Aditiva.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS contract_ratings JSONB NOT NULL DEFAULT '[]'::jsonb");
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE posts DROP COLUMN IF EXISTS contract_ratings');
  },
};
