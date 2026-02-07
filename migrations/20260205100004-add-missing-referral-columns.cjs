'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('referrals');

    // Helper to add column if not exists
    const addColumnIfNotExists = async (columnName, columnDef) => {
      if (!tableInfo[columnName]) {
        console.log(`Adding column ${columnName} to referrals`);
        await queryInterface.addColumn('referrals', columnName, columnDef);
      } else {
        console.log(`Column ${columnName} already exists in referrals`);
      }
    };

    // Core relationships
    await addColumnIfNotExists('referrer_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await addColumnIfNotExists('referred_user_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Referral codes
    await addColumnIfNotExists('referral_code', {
      type: Sequelize.STRING(20),
      allowNull: false,
      unique: true,
    });

    await addColumnIfNotExists('used_code', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    // Status tracking
    await addColumnIfNotExists('status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });

    await addColumnIfNotExists('registered_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await addColumnIfNotExists('first_contract_completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Rewards for referrer
    await addColumnIfNotExists('reward_granted', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await addColumnIfNotExists('reward_type', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });

    await addColumnIfNotExists('reward_granted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Usage tracking
    await addColumnIfNotExists('referrer_reward_used', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await addColumnIfNotExists('referred_first_contract_free', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Metadata
    await addColumnIfNotExists('source', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await addColumnIfNotExists('metadata', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    // Timestamps
    await addColumnIfNotExists('created_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    });

    await addColumnIfNotExists('updated_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    });

    // Add indexes (ignore errors if they already exist)
    const indexes = [
      { fields: ['referrer_id', 'status'], name: 'idx_referrals_referrer_status' },
      { fields: ['referred_user_id'], name: 'idx_referrals_referred_user' },
      { fields: ['referral_code'], name: 'idx_referrals_code', unique: true },
      { fields: ['used_code'], name: 'idx_referrals_used_code' },
      { fields: ['status', 'created_at'], name: 'idx_referrals_status_created' },
    ];

    for (const idx of indexes) {
      try {
        await queryInterface.addIndex('referrals', idx.fields, {
          name: idx.name,
          unique: idx.unique || false,
        });
      } catch (e) {
        console.log(`Index ${idx.name} may already exist`);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const columnsToRemove = [
      'referred_user_id', 'referral_code', 'used_code',
      'registered_at', 'first_contract_completed_at',
      'reward_granted', 'reward_type', 'reward_granted_at',
      'referrer_reward_used', 'referred_first_contract_free',
      'source', 'metadata'
    ];

    for (const column of columnsToRemove) {
      try {
        await queryInterface.removeColumn('referrals', column);
      } catch (e) {
        console.log(`Column ${column} might not exist`);
      }
    }
  }
};
