'use strict';

/**
 * La ampliacion de un contrato se cobra antes de aplicarse.
 *
 * Aprobar una extension con monto hacia `contract.price += extensionAmount` y
 * nada mas: el precio subia sin que nadie le cobrara al cliente, asi que la
 * plataforma quedaba debiendole al trabajador mas plata de la que tenia
 * retenida en escrow, y la diferencia salia del bolsillo de DOAPP. La comision
 * tampoco se recalculaba, con lo cual la ampliacion viajaba gratis.
 *
 * Esta columna guarda el pago de la ampliacion. Los dias se aplican al aprobar;
 * el precio recien sube cuando ese pago se acredita.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('contracts');
    if (!cols.extension_payment_id) {
      await queryInterface.addColumn('contracts', 'extension_payment_id', {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Pago de la ampliación; el precio sube cuando se acredita',
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('contracts');
    if (cols.extension_payment_id) {
      await queryInterface.removeColumn('contracts', 'extension_payment_id');
    }
  },
};
