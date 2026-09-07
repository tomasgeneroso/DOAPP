'use strict';

/**
 * Controles de seguridad sobre el dinero.
 *
 * fraud_hold_*        una alerta de fraude de MercadoPago frena el pago hasta
 *                     que un administrador mire el caso. Es distinto de una
 *                     disputa: no hay reclamo de nadie, hay una sospecha
 *                     automatica, y por eso se guarda aparte y se levanta con
 *                     un acto explicito que queda registrado.
 *
 * banking_info_updated_at  cuando se cambio el CBU. Un retiro inmediatamente
 *                     despues de cambiar la cuenta de destino es la firma tipica
 *                     de una cuenta tomada: el atacante entra, cambia el CBU y
 *                     retira. La demora es lo que le da tiempo al dueño real a
 *                     darse cuenta.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const contratos = await queryInterface.describeTable('contracts');

    if (!contratos.fraud_hold_at) {
      await queryInterface.addColumn('contracts', 'fraud_hold_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!contratos.fraud_hold_reason) {
      await queryInterface.addColumn('contracts', 'fraud_hold_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!contratos.fraud_hold_cleared_at) {
      await queryInterface.addColumn('contracts', 'fraud_hold_cleared_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!contratos.fraud_hold_cleared_by) {
      await queryInterface.addColumn('contracts', 'fraud_hold_cleared_by', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    const usuarios = await queryInterface.describeTable('users');
    if (!usuarios.banking_info_updated_at) {
      await queryInterface.addColumn('users', 'banking_info_updated_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const contratos = await queryInterface.describeTable('contracts');
    for (const c of ['fraud_hold_at', 'fraud_hold_reason', 'fraud_hold_cleared_at', 'fraud_hold_cleared_by']) {
      if (contratos[c]) await queryInterface.removeColumn('contracts', c);
    }
    const usuarios = await queryInterface.describeTable('users');
    if (usuarios.banking_info_updated_at) {
      await queryInterface.removeColumn('users', 'banking_info_updated_at');
    }
  },
};
