'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tables = await queryInterface.showAllTables();
    if (tables.includes('promoters')) {
      console.log('Table promoters already exists, skipping creation');
      return;
    }

    await queryInterface.createTable('promoters', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
      advertisement_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'advertisements',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      company_name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      contact_name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      contact_email: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      contact_phone: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      ad_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      payment_plan: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      pricing: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          basePrice: 0,
          totalPaid: 0,
          currency: 'ARS',
        },
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      analytics: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          totalImpressions: 0,
          totalClicks: 0,
          totalCost: 0,
          averageCTR: 0,
          averageCPM: 0,
          averageCPC: 0,
        },
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create indexes
    await queryInterface.addIndex('promoters', ['user_id'], {
      name: 'idx_promoters_user',
    });

    await queryInterface.addIndex('promoters', ['advertisement_id'], {
      name: 'idx_promoters_advertisement',
    });

    await queryInterface.addIndex('promoters', ['status', 'is_enabled'], {
      name: 'idx_promoters_status_enabled',
    });

    await queryInterface.addIndex('promoters', ['start_date', 'end_date'], {
      name: 'idx_promoters_dates',
    });

    await queryInterface.addIndex('promoters', ['status'], {
      name: 'idx_promoters_status',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('promoters');
  }
};
