'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('jobs', 'auto_select_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Optional: time when worker should be auto-selected (if client chooses scheduling)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('jobs', 'auto_select_at');
  }
};
