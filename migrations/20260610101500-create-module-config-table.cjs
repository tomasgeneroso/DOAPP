'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('module_configs', {
      module_id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "payment, dashboard, admin, feature"
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "MercadoPago, Analytics, etc."
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      config: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: "Module-specific configuration",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    // Index on category for efficient filtering
    await queryInterface.addIndex('module_configs', ['category']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('module_configs');
  },
};
