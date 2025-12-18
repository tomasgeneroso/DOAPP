'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add pending price decrease fields for worker approval workflow
    await queryInterface.addColumn('jobs', 'pending_price_decrease', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });

    await queryInterface.addColumn('jobs', 'pending_price_decrease_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('jobs', 'pending_price_decrease_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('jobs', 'price_decrease_acceptances', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });

    await queryInterface.addColumn('jobs', 'price_decrease_rejections', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobs', 'pending_price_decrease');
    await queryInterface.removeColumn('jobs', 'pending_price_decrease_reason');
    await queryInterface.removeColumn('jobs', 'pending_price_decrease_at');
    await queryInterface.removeColumn('jobs', 'price_decrease_acceptances');
    await queryInterface.removeColumn('jobs', 'price_decrease_rejections');
  }
};
