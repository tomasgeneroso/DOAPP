'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('blog_posts').catch(() => null);
    if (!tableDesc) {
      console.log('Table blog_posts does not exist, skipping');
      return;
    }

    if (!tableDesc.cover_image) {
      await queryInterface.addColumn('blog_posts', 'cover_image', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
      console.log('Added cover_image column to blog_posts');
    } else {
      console.log('cover_image column already exists, skipping');
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('blog_posts', 'cover_image');
  },
};
