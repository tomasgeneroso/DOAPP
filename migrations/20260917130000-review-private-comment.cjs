'use strict';

/**
 * Reseña publica (obligatoria) + nota privada (opcional) que solo lee la
 * persona reseñada y administracion. Idempotente; espejada en ensureSchema.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS private_comment TEXT;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE reviews DROP COLUMN IF EXISTS private_comment;
    `);
  },
};
