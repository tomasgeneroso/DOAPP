'use strict';

/**
 * Saldo vinculado a una publicación: cuando una publicación cancelada sin trabajador devuelve su precio como saldo a favor, esa plata queda
 * marcada acá como «de esa publicación». Sirve para reprogramarla (se paga con ese saldo) y para saber qué parte del saldo no es ganada
 * trabajando. Si el cliente retira ese saldo, la columna baja y la publicación solo se vuelve a publicar pagando de nuevo.
 *
 * Idempotente (IF NOT EXISTS): también la repite `ensureCriticalSchema` al arrancar.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS publication_credit NUMERIC(12,2) NOT NULL DEFAULT 0`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS publication_credit`);
  },
};
