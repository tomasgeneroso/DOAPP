'use strict';

/**
 * Modo de precio de la publicacion y pausa por inactividad.
 *
 * pricing_mode: 'fixed' el cliente pone un monto y lo paga al publicar;
 *               'quote' publica "a cotizar" y paga al aceptar una cotizacion.
 *
 * El default es 'fixed' porque es lo que hacian todas las publicaciones que ya
 * existen: tienen precio y lo pagaron al publicar.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabla = await queryInterface.describeTable('jobs');

    if (!tabla.pricing_mode) {
      await queryInterface.addColumn('jobs', 'pricing_mode', {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'fixed',
      });
    }

    if (!tabla.paused_for_inactivity_at) {
      await queryInterface.addColumn('jobs', 'paused_for_inactivity_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!tabla.resumed_at) {
      await queryInterface.addColumn('jobs', 'resumed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tabla = await queryInterface.describeTable('jobs');
    if (tabla.resumed_at) await queryInterface.removeColumn('jobs', 'resumed_at');
    if (tabla.paused_for_inactivity_at) await queryInterface.removeColumn('jobs', 'paused_for_inactivity_at');
    if (tabla.pricing_mode) await queryInterface.removeColumn('jobs', 'pricing_mode');
  },
};
