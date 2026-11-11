'use strict';

/**
 * La tabla `portfolio_items` (el portafolio del perfil: «compartir el trabajo terminado en mi perfil») nunca tuvo migración: se creaba solo con
 * `sequelize.sync()` en desarrollo y producción no sincroniza, así que ahí daba «relation "portfolio_items" does not exist» (2026-11-09).
 * Idempotente (IF NOT EXISTS); espejo en server/config/ensureSchema.ts. Lo que el modelo (`Portfolio.model.ts`) define, columna por columna.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`CREATE TABLE IF NOT EXISTS portfolio_items (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      linked_contract UUID REFERENCES contracts(id) ON DELETE SET NULL,
      linked_job UUID REFERENCES jobs(id) ON DELETE SET NULL,
      title VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(50) NOT NULL,
      price NUMERIC(12,2),
      images TEXT[] DEFAULT ARRAY[]::TEXT[],
      videos TEXT[] DEFAULT ARRAY[]::TEXT[],
      documents TEXT[] DEFAULT ARRAY[]::TEXT[],
      tags VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
      completed_at TIMESTAMPTZ,
      client_name VARCHAR(100),
      project_duration VARCHAR(100),
      featured BOOLEAN DEFAULT FALSE,
      views INTEGER DEFAULT 0,
      likes UUID[] DEFAULT ARRAY[]::UUID[],
      contract_rating NUMERIC(3,2),
      contract_review TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await q('CREATE INDEX IF NOT EXISTS portfolio_items_user_id_created_at ON portfolio_items (user_id, created_at)');
    await q('CREATE INDEX IF NOT EXISTS portfolio_items_category_featured ON portfolio_items (category, featured)');
    await q('CREATE INDEX IF NOT EXISTS portfolio_items_views ON portfolio_items (views)');
    await q('CREATE INDEX IF NOT EXISTS portfolio_items_featured_created_at ON portfolio_items (featured, created_at)');
    await q('CREATE INDEX IF NOT EXISTS portfolio_items_user_id_category ON portfolio_items (user_id, category)');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS portfolio_items');
  },
};
