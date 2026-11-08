'use strict';

/**
 * Identidad de la persona y unión de cuentas (2026-11-06). Idempotente; espejo en server/config/ensureSchema.ts.
 *
 *  - `users.identity_key`: huella (HMAC) de «primer apellido + primer nombre + fecha de nacimiento» leídos del documento verificado. Es lo que tienen en común
 *    todos los documentos de una persona (DNI y pasaporte argentinos, DNI y pasaporte italianos), a diferencia del número de documento. NO es única: una
 *    coincidencia no frena nada, avisa a administración. Ver `shared/identidad/clavePersona.ts`.
 *  - `users.merged_into_id`, `merged_at`, `merged_by`: la cuenta quedó unificada con otra (la misma persona con dos documentos). La cuenta unificada no inicia
 *    sesión; su historial queda en ella. Quién, cuándo y por qué queda en el registro de auditoría.
 *  - `users.launch_benefit_granted_at`: cuándo se le dio a la cuenta el beneficio de lanzamiento (el contrato libre de comisión y el mes de PRO de las primeras
 *    cuentas verificadas). Sirve para no dárselo dos veces.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_key VARCHAR(64)');
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES users(id)');
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ');
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_by UUID');
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS launch_benefit_granted_at TIMESTAMPTZ');
    await q('CREATE INDEX IF NOT EXISTS users_identity_key ON users (identity_key) WHERE identity_key IS NOT NULL');
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP INDEX IF EXISTS users_identity_key');
    await q('ALTER TABLE users DROP COLUMN IF EXISTS launch_benefit_granted_at');
    await q('ALTER TABLE users DROP COLUMN IF EXISTS merged_by');
    await q('ALTER TABLE users DROP COLUMN IF EXISTS merged_at');
    await q('ALTER TABLE users DROP COLUMN IF EXISTS merged_into_id');
    await q('ALTER TABLE users DROP COLUMN IF EXISTS identity_key');
  },
};
