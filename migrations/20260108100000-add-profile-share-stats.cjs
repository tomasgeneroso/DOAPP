'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add profile share statistics columns
    await queryInterface.addColumn('users', 'profile_shares_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    await queryInterface.addColumn('users', 'profile_shares_via_link', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    await queryInterface.addColumn('users', 'profile_shares_via_message', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    await queryInterface.addColumn('users', 'last_profile_share_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'profile_shares_count');
    await queryInterface.removeColumn('users', 'profile_shares_via_link');
    await queryInterface.removeColumn('users', 'profile_shares_via_message');
    await queryInterface.removeColumn('users', 'last_profile_share_at');
  }
};
