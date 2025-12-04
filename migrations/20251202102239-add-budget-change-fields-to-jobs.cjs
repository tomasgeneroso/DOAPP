'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Agregar campos para historial de cambios de presupuesto
    await queryInterface.addColumn('jobs', 'original_price', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });

    await queryInterface.addColumn('jobs', 'price_change_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('jobs', 'price_changed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('jobs', 'price_history', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });
  },

  async down (queryInterface, Sequelize) {
    // Revertir cambios
    await queryInterface.removeColumn('jobs', 'price_history');
    await queryInterface.removeColumn('jobs', 'price_changed_at');
    await queryInterface.removeColumn('jobs', 'price_change_reason');
    await queryInterface.removeColumn('jobs', 'original_price');
  }
};
