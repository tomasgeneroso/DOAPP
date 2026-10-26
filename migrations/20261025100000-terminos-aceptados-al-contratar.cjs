'use strict';

/**
 * Los términos del contrato se aceptan al contratar (el cliente al elegir al trabajador, el trabajador al postularse): ya no hay un paso aparte y el contrato
 * empieza solo a la hora de inicio. Los contratos que todavía no empezaron y quedaron con la aceptación «pendiente» del flujo viejo se dejan aceptados, con la
 * fecha en que se contrataron. Los que ya empezaron o terminaron no se tocan: su historial queda como estaba.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE contracts
         SET terms_accepted_by_client = true,
             terms_accepted_by_doer = true,
             terms_accepted = true,
             terms_accepted_at = COALESCE(terms_accepted_at, created_at)
       WHERE status IN ('pending', 'ready', 'accepted')
         AND (terms_accepted_by_client = false OR terms_accepted_by_doer = false)
    `);
  },

  async down() {
    // No se deshace: no hay forma de saber cuáles estaban «pendientes» antes.
  },
};
