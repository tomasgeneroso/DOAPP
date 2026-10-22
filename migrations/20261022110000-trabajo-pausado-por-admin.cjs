'use strict';

/**
 * `jobs.paused_by_admin`: la publicación la pausó un administrador. Antes la pausa de un admin usaba el estado `suspended` (el de «falta la fecha de
 * fin»), que el cron de fechas flexibles reactiva solo. Ahora es `paused` + esta marca. Idempotente: también la repite `ensureCriticalSchema`.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS paused_by_admin BOOLEAN NOT NULL DEFAULT false`);
    // Las fechas de antes de la última reprogramación (el panel de administración muestra de dónde viene la fecha nueva).
    await q.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rescheduled_from JSONB`);
    // Las pausadas por un admin antes de este cambio quedaron como `suspended` con estado anterior: pasan al esquema nuevo (si no, el cron las reactivaría).
    await q.query(`UPDATE jobs SET status = 'paused', paused_by_admin = true WHERE status = 'suspended' AND previous_status IS NOT NULL`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS rescheduled_from`);
    await queryInterface.sequelize.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS paused_by_admin`);
  },
};
