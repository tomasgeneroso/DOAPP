'use strict';

/**
 * Libro de acciones financieras irreversibles.
 *
 * Cada fila es un intento de mover plata hacia afuera de la plataforma: pagarle
 * al trabajador o devolverle al cliente. Existe por dos razones:
 *
 * 1. Idempotencia. Si una llamada al proveedor corta por timeout y se
 *    reintenta, la clave persistida hace que el reintento sea la MISMA
 *    operacion y no una segunda.
 *
 * 2. Exclusion mutua. Por contrato puede terminar UNA sola operacion
 *    terminal: o se le paga al trabajador, o se le devuelve al cliente. Nunca
 *    las dos. Hoy nada lo impide: no hay transacciones ni locks en el flujo de
 *    plata, asi que dos procesos concurrentes (el cron de vencimiento y un
 *    admin, o dos webhooks repetidos) pueden pagar y devolver el mismo dinero.
 *
 * El indice parcial de abajo es lo que hace cumplir (2) en la base, que es el
 * unico lugar donde una regla de este tipo se sostiene ante concurrencia real.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes('payment_actions')) {
      return;
    }

    await queryInterface.createTable('payment_actions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      contract_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'contracts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'El contrato cuyo dinero se mueve. RESTRICT: un contrato con plata movida no se borra.',
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'El pago de origen, cuando la accion deriva de uno concreto',
      },
      provider: {
        type: Sequelize.STRING(24),
        allowNull: false,
        comment: 'mercadopago | paypal | transferencia | binance | manual',
      },
      action_type: {
        type: Sequelize.STRING(24),
        allowNull: false,
        comment: 'PAYOUT | REFUND_TOTAL | REFUND_PARTIAL',
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'CREATED',
        comment: 'CREATED | SENT | SUCCEEDED | FAILED',
      },
      amount: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        comment: 'Monto que se mueve, en la moneda del pago. numeric, nunca float.',
      },
      currency: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'ARS' },
      external_reference: { type: Sequelize.STRING(120), allowNull: true },
      idempotency_key: {
        type: Sequelize.STRING(160),
        allowNull: false,
        unique: true,
        comment: 'Estable por operacion: un reintento reusa la misma clave',
      },
      request_payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      provider_resource_id: {
        type: Sequelize.STRING(120),
        allowNull: true,
        comment: 'Id que devuelve el proveedor (payment id, refund id, transferencia)',
      },
      error_detail: { type: Sequelize.TEXT, allowNull: true },
      executed_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Admin que la disparo; null si la disparo un proceso automatico',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('payment_actions', ['contract_id'], {
      name: 'payment_actions_contract',
    });
    await queryInterface.addIndex('payment_actions', ['status', 'created_at'], {
      name: 'payment_actions_status_created',
    });

    // La regla del negocio, en la base.
    //
    // Un unique(contract_id, action_type) -- que es lo primero que uno escribe --
    // NO alcanza: permitiria un PAYOUT y ademas un REFUND_TOTAL sobre el mismo
    // contrato, que es exactamente lo que hay que impedir. La restriccion tiene
    // que ser sobre el contrato solo, restringida a las acciones terminales que
    // no fracasaron.
    //
    // Se excluye FAILED a proposito: un refund que el proveedor rechazo no
    // puede dejar el contrato trabado para siempre.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX payment_actions_one_terminal_per_contract
      ON payment_actions (contract_id)
      WHERE action_type IN ('PAYOUT', 'REFUND_TOTAL', 'REFUND_PARTIAL')
        AND status <> 'FAILED'
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE payment_actions
      ADD CONSTRAINT payment_actions_amount_positive CHECK (amount > 0)
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_actions');
  },
};
