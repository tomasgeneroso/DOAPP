'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'quote_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'quotes', key: 'id' },
      onDelete: 'SET NULL',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('payments', 'quote_id');
  },
};
