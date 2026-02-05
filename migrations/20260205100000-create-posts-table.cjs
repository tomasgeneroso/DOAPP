'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tables = await queryInterface.showAllTables();
    if (tables.includes('posts')) {
      console.log('Table posts already exists, skipping creation');
      return;
    }

    // Create ENUM types first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_posts_currency" AS ENUM ('ARS', 'USD');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_posts_type" AS ENUM ('post', 'article');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('posts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      author: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      gallery: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      currency: {
        type: 'enum_posts_currency',
        allowNull: false,
        defaultValue: 'ARS',
      },
      type: {
        type: 'enum_posts_type',
        allowNull: false,
        defaultValue: 'post',
      },
      likes: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: false,
        defaultValue: [],
      },
      likes_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      comments_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      views_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: [],
      },
      linked_contract: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'contracts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create indexes
    await queryInterface.addIndex('posts', ['author', 'created_at'], {
      name: 'idx_post_author_date',
    });

    await queryInterface.addIndex('posts', ['type', 'is_published', 'created_at'], {
      name: 'idx_post_type_published_date',
    });

    await queryInterface.addIndex('posts', ['tags'], {
      name: 'idx_post_tags',
      using: 'gin',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('posts');

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_posts_currency";
      DROP TYPE IF EXISTS "enum_posts_type";
    `);
  }
};
