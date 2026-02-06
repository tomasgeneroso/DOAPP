'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('reviews');

    // Helper to add column if not exists
    const addColumnIfNotExists = async (columnName, columnDef) => {
      if (!tableInfo[columnName]) {
        console.log(`Adding column ${columnName} to reviews`);
        await queryInterface.addColumn('reviews', columnName, columnDef);
      } else {
        console.log(`Column ${columnName} already exists in reviews`);
      }
    };

    // Core columns
    await addColumnIfNotExists('contract_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'contracts',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await addColumnIfNotExists('reviewer_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await addColumnIfNotExists('reviewed_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await addColumnIfNotExists('rating', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await addColumnIfNotExists('comment', {
      type: Sequelize.TEXT,
      allowNull: false,
    });

    // Category ratings
    await addColumnIfNotExists('work_quality_rating', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists('worker_rating', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists('contract_rating', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Specific ratings
    await addColumnIfNotExists('communication', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists('professionalism', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists('quality', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists('timeliness', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Moderation
    await addColumnIfNotExists('is_visible', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await addColumnIfNotExists('is_flagged', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await addColumnIfNotExists('flag_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await addColumnIfNotExists('moderated_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await addColumnIfNotExists('moderated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Response
    await addColumnIfNotExists('response', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await addColumnIfNotExists('responded_at', {
      type: Sequelize.DATE,
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
    try {
      await queryInterface.addIndex('reviews', ['contract_id'], {
        name: 'idx_reviews_contract_id',
      });
    } catch (e) { console.log('Index idx_reviews_contract_id may already exist'); }

    try {
      await queryInterface.addIndex('reviews', ['reviewer_id', 'created_at'], {
        name: 'idx_reviews_reviewer_created',
      });
    } catch (e) { console.log('Index idx_reviews_reviewer_created may already exist'); }

    try {
      await queryInterface.addIndex('reviews', ['reviewed_id', 'is_visible', 'created_at'], {
        name: 'idx_reviews_reviewed_visible_created',
      });
    } catch (e) { console.log('Index idx_reviews_reviewed_visible_created may already exist'); }

    try {
      await queryInterface.addIndex('reviews', ['rating'], {
        name: 'idx_reviews_rating',
      });
    } catch (e) { console.log('Index idx_reviews_rating may already exist'); }

    try {
      await queryInterface.addIndex('reviews', ['contract_id', 'reviewer_id'], {
        name: 'idx_reviews_contract_reviewer_unique',
        unique: true,
      });
    } catch (e) { console.log('Index idx_reviews_contract_reviewer_unique may already exist'); }
  },

  async down(queryInterface, Sequelize) {
    // Only remove columns that we added (not core ones that might have existed)
    const columnsToRemove = [
      'work_quality_rating', 'worker_rating', 'contract_rating',
      'communication', 'professionalism', 'quality', 'timeliness',
      'is_visible', 'is_flagged', 'flag_reason',
      'moderated_by', 'moderated_at',
      'response', 'responded_at'
    ];

    for (const column of columnsToRemove) {
      try {
        await queryInterface.removeColumn('reviews', column);
      } catch (e) {
        console.log(`Column ${column} might not exist`);
      }
    }
  }
};
