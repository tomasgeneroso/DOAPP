'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists (created by Sequelize sync)
    const tableExists = await queryInterface.sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_tasks'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (tableExists.length > 0) {
      console.log('Table job_tasks already exists, skipping creation');
      return;
    }

    await queryInterface.createTable('job_tasks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
      created_by_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      order_index: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed'),
        defaultValue: 'pending',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      requires_previous_completion: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      depends_on_task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'job_tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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
    await queryInterface.addIndex('job_tasks', ['job_id']);
    await queryInterface.addIndex('job_tasks', ['job_id', 'order_index']);
    await queryInterface.addIndex('job_tasks', ['status']);
    await queryInterface.addIndex('job_tasks', ['completed_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('job_tasks');
  }
};
