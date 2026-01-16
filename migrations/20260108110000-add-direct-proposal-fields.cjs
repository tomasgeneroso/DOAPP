'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make job_id nullable for direct proposals
    await queryInterface.changeColumn('proposals', 'job_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // Add direct proposal flag
    await queryInterface.addColumn('proposals', 'is_direct_proposal', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    // Add conversation reference
    await queryInterface.addColumn('proposals', 'conversation_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // Add direct proposal details
    await queryInterface.addColumn('proposals', 'direct_title', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });

    await queryInterface.addColumn('proposals', 'direct_description', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('proposals', 'direct_location', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('proposals', 'direct_category', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.addColumn('proposals', 'direct_start_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('proposals', 'direct_end_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add index for direct proposals
    await queryInterface.addIndex('proposals', ['is_direct_proposal'], {
      name: 'proposals_is_direct_proposal_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('proposals', 'proposals_is_direct_proposal_idx');
    await queryInterface.removeColumn('proposals', 'direct_end_date');
    await queryInterface.removeColumn('proposals', 'direct_start_date');
    await queryInterface.removeColumn('proposals', 'direct_category');
    await queryInterface.removeColumn('proposals', 'direct_location');
    await queryInterface.removeColumn('proposals', 'direct_description');
    await queryInterface.removeColumn('proposals', 'direct_title');
    await queryInterface.removeColumn('proposals', 'conversation_id');
    await queryInterface.removeColumn('proposals', 'is_direct_proposal');

    // Restore job_id as NOT NULL (may fail if there are null values)
    await queryInterface.changeColumn('proposals', 'job_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  }
};
