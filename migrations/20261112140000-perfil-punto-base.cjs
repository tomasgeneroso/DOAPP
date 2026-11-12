'use strict';

/**
 * Punto base de la zona de trabajo (pedido del dueño, 2026-11-12): `work_latitude` y `work_longitude`, el centro de la ciudad del domicilio redondeado a ~1 km. Privado: sirve para filtrar el muro
 * por radio («Para mí»). Idempotente: espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS work_latitude DOUBLE PRECISION;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS work_longitude DOUBLE PRECISION;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS work_latitude;
      ALTER TABLE users DROP COLUMN IF EXISTS work_longitude;
    `);
  },
};
