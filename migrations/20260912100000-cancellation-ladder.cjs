'use strict';

/**
 * Escalera de penalidades al trabajador que cancela trabajos aceptados.
 *
 * cancellation_mark_until: hasta cuando el perfil muestra la marca visible.
 * suspended_from_applying_until: hasta cuando no puede postularse.
 *
 * Los dos son fechas y no booleanos porque la penalidad vence sola: un
 * trabajador que cancelo dos veces hace seis meses y desde entonces cumplio no
 * tiene por que cargar la marca para siempre.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabla = await queryInterface.describeTable('users');
    if (!tabla.cancellation_mark_until) {
      await queryInterface.addColumn('users', 'cancellation_mark_until', {
        type: Sequelize.DATE, allowNull: true,
      });
    }
    if (!tabla.suspended_from_applying_until) {
      await queryInterface.addColumn('users', 'suspended_from_applying_until', {
        type: Sequelize.DATE, allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    const tabla = await queryInterface.describeTable('users');
    if (tabla.cancellation_mark_until) await queryInterface.removeColumn('users', 'cancellation_mark_until');
    if (tabla.suspended_from_applying_until) await queryInterface.removeColumn('users', 'suspended_from_applying_until');
  },
};
