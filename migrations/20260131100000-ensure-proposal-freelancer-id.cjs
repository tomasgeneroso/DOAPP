'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if freelancer_id column exists
    const tableInfo = await queryInterface.describeTable('proposals');

    if (!tableInfo.freelancer_id) {
      console.log('Adding missing freelancer_id column to proposals table...');
      await queryInterface.addColumn('proposals', 'freelancer_id', {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      });

      // Add index
      await queryInterface.addIndex('proposals', ['freelancer_id'], {
        name: 'proposals_freelancer_id_idx',
      });

      // Add composite unique index
      await queryInterface.addIndex('proposals', ['job_id', 'freelancer_id'], {
        name: 'proposals_job_freelancer_unique',
        unique: true,
      });
    } else {
      console.log('freelancer_id column already exists in proposals table');
    }
  },

  async down(queryInterface, Sequelize) {
    // Only remove if it was added by this migration
    // In practice, we don't want to remove this column
  }
};
