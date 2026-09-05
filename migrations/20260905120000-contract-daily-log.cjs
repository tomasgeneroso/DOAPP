'use strict';

/**
 * Control diario del contrato.
 *
 * Un tablero donde cualquiera de las dos partes marca "se trabajó" en un día.
 * Nadie está obligado: es un control pasivo, no un parte diario.
 *
 * Sirve para frenar la alerta de ausencia -- cualquier marca reinicia el
 * contador -- y como evidencia en el expediente: un contracargo sobre un
 * contrato donde el cliente marcó doce días como trabajados es muy difícil de
 * sostener ante el emisor de la tarjeta.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('contracts');
    if (!cols.daily_log) {
      await queryInterface.addColumn('contracts', 'daily_log', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Marcas de control día por día; no influye en pagos ni disputas',
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('contracts');
    if (cols.daily_log) {
      await queryInterface.removeColumn('contracts', 'daily_log');
    }
  },
};
