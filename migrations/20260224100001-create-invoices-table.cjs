'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('invoices')) {
      console.log('Table invoices already exists, skipping creation');
      return;
    }

    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      invoice_number: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true,
      },
      type: {
        type: Sequelize.ENUM('client_payment', 'worker_payment', 'commission', 'withdrawal'),
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'payments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      contract_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'contracts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      withdrawal_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'withdrawal_requests',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      commission: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: 'ARS',
      },
      pdf_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      status: {
        type: Sequelize.ENUM('generated', 'sent', 'void'),
        allowNull: false,
        defaultValue: 'generated',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Indexes
    await queryInterface.addIndex('invoices', ['user_id']);
    await queryInterface.addIndex('invoices', ['payment_id']);
    await queryInterface.addIndex('invoices', ['contract_id']);
    await queryInterface.addIndex('invoices', ['type']);
    await queryInterface.addIndex('invoices', ['invoice_number'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoices');
  },
};
