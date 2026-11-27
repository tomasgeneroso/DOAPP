'use strict';

/**
 * Pedidos del 2026-11-27: quién aceptó cada postulación (quien publicó o la selección automática), el pie de las fotos de un trabajo y la dirección de destino (mudanzas y mandados).
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE proposals ADD COLUMN IF NOT EXISTS approved_by VARCHAR(12)');
    await q('ALTER TABLE proposals ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ');
    await q("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS image_captions JSONB NOT NULL DEFAULT '{}'::jsonb");
    await q('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS destination JSONB');
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE proposals DROP COLUMN IF EXISTS approved_by');
    await q('ALTER TABLE proposals DROP COLUMN IF EXISTS approved_at');
    await q('ALTER TABLE jobs DROP COLUMN IF EXISTS image_captions');
    await q('ALTER TABLE jobs DROP COLUMN IF EXISTS destination');
  },
};
