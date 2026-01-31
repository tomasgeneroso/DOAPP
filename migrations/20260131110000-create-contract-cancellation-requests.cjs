'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contract_cancellation_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      contract_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'contracts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'jobs',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      other_party_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'pending',
        allowNull: false,
      },
      priority: {
        type: Sequelize.STRING(20),
        defaultValue: 'medium',
        allowNull: false,
      },
      request_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      attachments: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      assigned_to: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      resolved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      resolution_note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      resolution: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      refund_approved: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      refund_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      previous_job_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      previous_contract_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      admin_notes: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      status_history: {
        type: Sequelize.JSONB,
        defaultValue: [],
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

    // Add indexes
    await queryInterface.addIndex('contract_cancellation_requests', ['contract_id']);
    await queryInterface.addIndex('contract_cancellation_requests', ['job_id']);
    await queryInterface.addIndex('contract_cancellation_requests', ['requested_by']);
    await queryInterface.addIndex('contract_cancellation_requests', ['status']);
    await queryInterface.addIndex('contract_cancellation_requests', ['priority']);
    await queryInterface.addIndex('contract_cancellation_requests', ['assigned_to']);
    await queryInterface.addIndex('contract_cancellation_requests', ['status', 'priority']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('contract_cancellation_requests');
  }
};
