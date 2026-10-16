'use strict';

/** Registro en pasos: la cuenta existe pero falta verificar la identidad y completar los datos. Espejo de server/config/ensureSchema.ts. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_pending BOOLEAN NOT NULL DEFAULT false');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS registration_pending');
  },
};
