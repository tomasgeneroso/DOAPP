'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add twitter_id column to users table
    await queryInterface.addColumn('users', 'twitter_id', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Add index for twitter_id
    await queryInterface.addIndex('users', ['twitter_id'], {
      name: 'users_twitter_id',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove index first
    await queryInterface.removeIndex('users', 'users_twitter_id');

    // Remove column
    await queryInterface.removeColumn('users', 'twitter_id');
  }
};
