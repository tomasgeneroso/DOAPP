'use strict';

/**
 * Matrícula profesional encriptada.
 *
 * - users.license_number pasa a TEXT: guardado encriptado (AES-256-GCM, formato iv:authTag:datos en hex) ocupa mucho más
 *   que el número y no entraba en VARCHAR(100) si el número era largo.
 * - users.license_document_back_url: el reverso de la matrícula (hasta dos archivos: frente y reverso).
 *
 * No encripta los datos que ya existen: eso lo hace la tarea de arranque (server/services/matricula.ts), que necesita la
 * clave de la aplicación y toca archivos en disco, cosas que una migración no tiene.
 *
 * Idempotente: pasar a TEXT una columna que ya es TEXT no cambia nada, y ADD COLUMN lleva IF NOT EXISTS.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users ALTER COLUMN license_number TYPE TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS license_document_back_url TEXT;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS license_document_back_url;
    `);
    // license_number se deja en TEXT: volver a VARCHAR(100) truncaría o rompería los valores encriptados.
  },
};
