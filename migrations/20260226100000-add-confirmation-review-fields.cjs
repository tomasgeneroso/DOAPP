'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('contracts');

    // Who proposed the hours (client or doer UUID)
    if (!tableDescription.confirmation_proposed_by) {
      await queryInterface.addColumn('contracts', 'confirmation_proposed_by', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    // Proposed actual start time
    if (!tableDescription.proposed_start_time) {
      await queryInterface.addColumn('contracts', 'proposed_start_time', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    // Proposed actual end time
    if (!tableDescription.proposed_end_time) {
      await queryInterface.addColumn('contracts', 'proposed_end_time', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    // Notes from whoever confirms
    if (!tableDescription.confirmation_notes) {
      await queryInterface.addColumn('contracts', 'confirmation_notes', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    // Rejection reason (if other party rejects)
    if (!tableDescription.confirmation_rejection_reason) {
      await queryInterface.addColumn('contracts', 'confirmation_rejection_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    // History of confirmation proposals/changes (JSONB array)
    if (!tableDescription.confirmation_history) {
      await queryInterface.addColumn('contracts', 'confirmation_history', {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('contracts', 'confirmation_proposed_by');
    await queryInterface.removeColumn('contracts', 'proposed_start_time');
    await queryInterface.removeColumn('contracts', 'proposed_end_time');
    await queryInterface.removeColumn('contracts', 'confirmation_notes');
    await queryInterface.removeColumn('contracts', 'confirmation_rejection_reason');
    await queryInterface.removeColumn('contracts', 'confirmation_history');
  },
};
