'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add MercadoPago OAuth fields to users table
    await queryInterface.addColumn('users', 'mercadopago_user_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'MercadoPago user ID for split payments',
    });

    await queryInterface.addColumn('users', 'mercadopago_access_token', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Encrypted OAuth access token for MercadoPago',
    });

    await queryInterface.addColumn('users', 'mercadopago_refresh_token', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Encrypted OAuth refresh token for MercadoPago',
    });

    await queryInterface.addColumn('users', 'mercadopago_token_expires_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the MercadoPago access token expires',
    });

    await queryInterface.addColumn('users', 'mercadopago_linked_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the user linked their MercadoPago account',
    });

    await queryInterface.addColumn('users', 'mercadopago_email', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Email associated with MercadoPago account',
    });

    await queryInterface.addColumn('users', 'mercadopago_public_key', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Public key for this seller in marketplace',
    });

    await queryInterface.addColumn('users', 'prefers_mercadopago_payout', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Whether user prefers automatic MercadoPago payouts vs manual bank transfer',
    });

    // Add index for mercadopago_user_id
    await queryInterface.addIndex('users', ['mercadopago_user_id'], {
      name: 'users_mercadopago_user_id_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove index
    await queryInterface.removeIndex('users', 'users_mercadopago_user_id_idx');

    // Remove columns
    await queryInterface.removeColumn('users', 'prefers_mercadopago_payout');
    await queryInterface.removeColumn('users', 'mercadopago_public_key');
    await queryInterface.removeColumn('users', 'mercadopago_email');
    await queryInterface.removeColumn('users', 'mercadopago_linked_at');
    await queryInterface.removeColumn('users', 'mercadopago_token_expires_at');
    await queryInterface.removeColumn('users', 'mercadopago_refresh_token');
    await queryInterface.removeColumn('users', 'mercadopago_access_token');
    await queryInterface.removeColumn('users', 'mercadopago_user_id');
  }
};
