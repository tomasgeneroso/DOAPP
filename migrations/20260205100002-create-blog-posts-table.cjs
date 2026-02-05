'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tables = await queryInterface.showAllTables();
    if (tables.includes('blog_posts')) {
      console.log('Table blog_posts already exists, skipping creation');
      return;
    }

    // Create ENUM types first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_blog_posts_category" AS ENUM (
          'Limpieza', 'Reparaciones', 'Mantenimiento',
          'Productos Ecológicos', 'Hogar', 'Jardín', 'Tips', 'Otros'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_blog_posts_status" AS ENUM ('draft', 'published', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_blog_posts_post_type" AS ENUM ('official', 'user');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('blog_posts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      subtitle: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(250),
        allowNull: false,
        unique: true,
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      excerpt: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      author: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      cover_image: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },
      category: {
        type: 'enum_blog_posts_category',
        allowNull: false,
      },
      status: {
        type: 'enum_blog_posts_status',
        allowNull: false,
        defaultValue: 'draft',
      },
      views: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      post_type: {
        type: 'enum_blog_posts_post_type',
        allowNull: false,
        defaultValue: 'user',
      },
      meta_title: {
        type: Sequelize.STRING(70),
        allowNull: true,
      },
      meta_description: {
        type: Sequelize.STRING(160),
        allowNull: true,
      },
      meta_keywords: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },
      canonical_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      og_image: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      indexable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      reading_time: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      featured: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      seo_score: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
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
    await queryInterface.addIndex('blog_posts', ['slug'], {
      name: 'idx_blog_slug',
      unique: true,
    });

    await queryInterface.addIndex('blog_posts', ['status', 'published_at'], {
      name: 'idx_blog_status_published',
    });

    await queryInterface.addIndex('blog_posts', ['category', 'status'], {
      name: 'idx_blog_category_status',
    });

    await queryInterface.addIndex('blog_posts', ['tags'], {
      name: 'idx_blog_tags',
      using: 'gin',
    });

    await queryInterface.addIndex('blog_posts', ['created_at'], {
      name: 'idx_blog_created',
    });

    await queryInterface.addIndex('blog_posts', ['post_type'], {
      name: 'idx_blog_post_type',
    });

    await queryInterface.addIndex('blog_posts', ['created_by'], {
      name: 'idx_blog_created_by',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('blog_posts');

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_blog_posts_category";
      DROP TYPE IF EXISTS "enum_blog_posts_status";
      DROP TYPE IF EXISTS "enum_blog_posts_post_type";
    `);
  }
};
