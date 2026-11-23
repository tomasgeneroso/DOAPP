'use strict';

/**
 * Trabajos eliminados: no se borran, se guardan (pedido del dueño, 2026-11-23). `jobs.deleted_at` y `jobs.deleted_by`. Quien publicó lo ve 30 días en «Ver papelera de trabajos»;
 * el equipo lo ve siempre como «Eliminado» y solo se borra de verdad con `DELETE /api/admin/jobs/:id/permanent` (nombre del trabajo y motivo, con asiento en el registro).
 * Idempotente (también la crea `ensureSchema`).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await queryInterface.sequelize.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deleted_by UUID`);
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON jobs (deleted_at) WHERE deleted_at IS NOT NULL`);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_jobs_deleted_at`);
    await queryInterface.sequelize.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS deleted_by`);
    await queryInterface.sequelize.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS deleted_at`);
  },
};
