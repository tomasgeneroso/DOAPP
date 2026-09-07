'use strict';

/**
 * Permitir que el registro de auditoria asiente eventos del sistema.
 *
 * performed_by era NOT NULL y apuntaba a un usuario, asi que solo se podian
 * registrar acciones de un administrador. Los movimientos de plata que corren
 * solos -- la liberacion automatica del escrow, un contracargo que llega por
 * webhook, un reembolso disparado por un cron -- no tienen usuario, y por eso
 * eran justamente los que no quedaban registrados. Son los que mas importa
 * poder reconstruir despues.
 *
 * actor guarda quien fue cuando no hay usuario: 'system', 'webhook:mercadopago',
 * 'cron:autoConfirm'. Sin eso, un performed_by nulo no dice nada.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabla = await queryInterface.describeTable('audit_logs');

    if (tabla.performed_by && tabla.performed_by.allowNull === false) {
      await queryInterface.changeColumn('audit_logs', 'performed_by', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    if (tabla.admin_role && tabla.admin_role.allowNull === false) {
      await queryInterface.changeColumn('audit_logs', 'admin_role', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }

    if (!tabla.actor) {
      await queryInterface.addColumn('audit_logs', 'actor', {
        type: Sequelize.STRING(60),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tabla = await queryInterface.describeTable('audit_logs');
    if (tabla.actor) await queryInterface.removeColumn('audit_logs', 'actor');
    // performed_by y admin_role no se vuelven a NOT NULL: para entonces ya
    // puede haber filas del sistema con esos campos vacios y la migracion
    // fallaria a mitad de camino.
  },
};
