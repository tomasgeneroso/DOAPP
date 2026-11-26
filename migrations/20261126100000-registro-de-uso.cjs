'use strict';

/**
 * Registro de uso propio para los índices de /admin/metricas (pedido del 2026-11-26):
 * activity_days = una fila por persona, día y plataforma (visitas y duración); usage_counters = contadores diarios sin personas
 * (descargas del APK y primeras aperturas). Espejo en server/config/ensureSchema.ts. Aditiva: el código anterior las ignora.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'CREATE TABLE IF NOT EXISTS activity_days (user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, platform VARCHAR(10) NOT NULL, sessions INTEGER NOT NULL DEFAULT 1, seconds INTEGER NOT NULL DEFAULT 0, first_seen_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, day, platform))',
    );
    await queryInterface.sequelize.query('CREATE INDEX IF NOT EXISTS activity_days_day ON activity_days (day)');
    await queryInterface.sequelize.query('CREATE TABLE IF NOT EXISTS usage_counters (day DATE NOT NULL, name VARCHAR(40) NOT NULL, total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name))');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS activity_days');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS usage_counters');
  },
};
