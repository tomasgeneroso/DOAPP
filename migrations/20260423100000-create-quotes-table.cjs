'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('quotes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      quote_number: {
        type: Sequelize.STRING(20),
        unique: true,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'sent',
        allowNull: false,
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      recipient_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'SET NULL',
      },
      proposal_id: { type: Sequelize.UUID, allowNull: true },
      conversation_id: { type: Sequelize.UUID, allowNull: true },
      title: { type: Sequelize.STRING(200), allowNull: false },
      items: { type: Sequelize.JSONB, defaultValue: [], allowNull: false },
      subtotal: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      tax_rate: { type: Sequelize.DECIMAL(5, 2), defaultValue: 21, allowNull: false },
      tax_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      other_taxes: { type: Sequelize.JSONB, defaultValue: [], allowNull: false },
      total: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      payment_terms: { type: Sequelize.STRING(200), allowNull: true },
      valid_until: { type: Sequelize.DATE, allowNull: true },
      rejection_reason: { type: Sequelize.TEXT, allowNull: true },
      revision_count: { type: Sequelize.INTEGER, defaultValue: 0, allowNull: false },
      sender_info: { type: Sequelize.JSONB, allowNull: true },
      recipient_info: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('quotes', ['sender_id', 'status']);
    await queryInterface.addIndex('quotes', ['recipient_id', 'status']);
    await queryInterface.addIndex('quotes', ['job_id']);
    await queryInterface.addIndex('quotes', ['conversation_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('quotes');
  },
};
