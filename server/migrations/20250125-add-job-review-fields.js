/**
 * Migration: Add admin review fields to jobs table
 * Fields: rejectedReason, reviewedBy, reviewedAt
 */

export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('jobs', 'rejected_reason', {
    type: Sequelize.TEXT,
    allowNull: true,
  });

  await queryInterface.addColumn('jobs', 'reviewed_by', {
    type: Sequelize.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });

  await queryInterface.addColumn('jobs', 'reviewed_at', {
    type: Sequelize.DATE,
    allowNull: true,
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('jobs', 'rejected_reason');
  await queryInterface.removeColumn('jobs', 'reviewed_by');
  await queryInterface.removeColumn('jobs', 'reviewed_at');
}
