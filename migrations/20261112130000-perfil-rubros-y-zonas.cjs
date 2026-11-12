'use strict';

/**
 * Rubros y zona de trabajo del perfil (pedido del dueño, 2026-11-12): `work_categories` (ids de rubros), `work_any_category` («cualquier rubro»),
 * `work_zones` (otras zonas, además del domicilio) y `work_radius_km` (radio desde el domicilio). Idempotente: espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS work_categories TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS work_any_category BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS work_zones JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS work_radius_km INTEGER;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS work_categories;
      ALTER TABLE users DROP COLUMN IF EXISTS work_any_category;
      ALTER TABLE users DROP COLUMN IF EXISTS work_zones;
      ALTER TABLE users DROP COLUMN IF EXISTS work_radius_km;
    `);
  },
};
