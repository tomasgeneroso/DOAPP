'use strict';

/**
 * Migration: Add Task Claim System
 *
 * This migration adds support for clients to claim uncompleted tasks
 * instead of directly opening a dispute. The worker can confirm or deny
 * the claim, and if denied, a dispute is automatically created.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add task claim fields to contracts table
    await queryInterface.addColumn('contracts', 'has_pending_task_claim', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    await queryInterface.addColumn('contracts', 'task_claim_requested_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('contracts', 'task_claim_requested_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    });

    await queryInterface.addColumn('contracts', 'task_claim_new_end_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('contracts', 'task_claim_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // JSONB array to store claimed task IDs
    await queryInterface.addColumn('contracts', 'claimed_task_ids', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });

    // Worker response fields
    await queryInterface.addColumn('contracts', 'task_claim_responded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('contracts', 'task_claim_response', {
      type: Sequelize.ENUM('pending', 'accepted', 'rejected'),
      allowNull: true,
    });

    await queryInterface.addColumn('contracts', 'task_claim_rejection_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Track task claim history (for multiple claims)
    await queryInterface.addColumn('contracts', 'task_claim_history', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });

    // Add fields to job_tasks table for claim tracking
    await queryInterface.addColumn('job_tasks', 'is_claimed', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    await queryInterface.addColumn('job_tasks', 'claimed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('job_tasks', 'claimed_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    });

    await queryInterface.addColumn('job_tasks', 'claim_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add photo evidence fields to job_tasks
    await queryInterface.addColumn('job_tasks', 'evidence_photos', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });

    await queryInterface.addColumn('job_tasks', 'evidence_uploaded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('job_tasks', 'evidence_uploaded_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    });

    // Add index for faster queries
    await queryInterface.addIndex('contracts', ['has_pending_task_claim'], {
      name: 'idx_contracts_pending_task_claim',
    });

    await queryInterface.addIndex('job_tasks', ['is_claimed'], {
      name: 'idx_job_tasks_claimed',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('contracts', 'idx_contracts_pending_task_claim');
    await queryInterface.removeIndex('job_tasks', 'idx_job_tasks_claimed');

    // Remove contract columns
    await queryInterface.removeColumn('contracts', 'has_pending_task_claim');
    await queryInterface.removeColumn('contracts', 'task_claim_requested_at');
    await queryInterface.removeColumn('contracts', 'task_claim_requested_by');
    await queryInterface.removeColumn('contracts', 'task_claim_new_end_date');
    await queryInterface.removeColumn('contracts', 'task_claim_reason');
    await queryInterface.removeColumn('contracts', 'claimed_task_ids');
    await queryInterface.removeColumn('contracts', 'task_claim_responded_at');
    await queryInterface.removeColumn('contracts', 'task_claim_response');
    await queryInterface.removeColumn('contracts', 'task_claim_rejection_reason');
    await queryInterface.removeColumn('contracts', 'task_claim_history');

    // Remove job_tasks columns
    await queryInterface.removeColumn('job_tasks', 'is_claimed');
    await queryInterface.removeColumn('job_tasks', 'claimed_at');
    await queryInterface.removeColumn('job_tasks', 'claimed_by');
    await queryInterface.removeColumn('job_tasks', 'claim_notes');
    await queryInterface.removeColumn('job_tasks', 'evidence_photos');
    await queryInterface.removeColumn('job_tasks', 'evidence_uploaded_at');
    await queryInterface.removeColumn('job_tasks', 'evidence_uploaded_by');

    // Remove enum
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_contracts_task_claim_response";'
    );
  }
};
