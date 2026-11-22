'use strict';

/**
 * Publicaciones de trabajos terminados: a quién se etiquetó (pedido del dueño, 2026-11-22): `posts.tagged_users`, una lista de ids de personas.
 * Idempotente (también la crea `ensureSchema`).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS tagged_users JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE posts DROP COLUMN IF EXISTS tagged_users`);
  },
};
