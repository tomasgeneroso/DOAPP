'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('blog_posts').catch(() => null);
    if (!tableDesc) {
      console.log('Table blog_posts does not exist, skipping');
      return;
    }

    // Columns created by sync() in camelCase that need to be snake_case
    const renames = [
      ['coverImage', 'cover_image'],
      ['publishedAt', 'published_at'],
      ['postType', 'post_type'],
      ['metaTitle', 'meta_title'],
      ['metaDescription', 'meta_description'],
      ['metaKeywords', 'meta_keywords'],
      ['canonicalUrl', 'canonical_url'],
      ['ogImage', 'og_image'],
      ['readingTime', 'reading_time'],
      ['seoScore', 'seo_score'],
      ['createdBy', 'created_by'],
      ['updatedBy', 'updated_by'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ];

    for (const [oldName, newName] of renames) {
      if (tableDesc[oldName] && !tableDesc[newName]) {
        await queryInterface.renameColumn('blog_posts', oldName, newName);
        console.log(`Renamed ${oldName} -> ${newName}`);
      } else if (tableDesc[oldName] && tableDesc[newName]) {
        // Both exist (e.g. coverImage + cover_image from previous migration)
        // Copy data from camelCase to snake_case if snake_case is empty, then drop camelCase
        await queryInterface.sequelize.query(
          `UPDATE blog_posts SET "${newName}" = "${oldName}" WHERE "${newName}" IS NULL AND "${oldName}" IS NOT NULL`
        );
        await queryInterface.removeColumn('blog_posts', oldName);
        console.log(`Merged ${oldName} into ${newName} and dropped ${oldName}`);
      } else {
        console.log(`${oldName} -> ${newName}: no action needed`);
      }
    }

    // Drop old camelCase ENUM type if it exists (snake_case one already exists from migration)
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        -- Update column to use the snake_case enum type if it's using the camelCase one
        ALTER TABLE blog_posts ALTER COLUMN post_type TYPE "enum_blog_posts_post_type" USING post_type::text::"enum_blog_posts_post_type";
      EXCEPTION
        WHEN others THEN null;
      END $$;
    `);
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_blog_posts_postType";
    `);

    // Fix foreign key constraints to point to renamed columns
    // They should auto-update with renameColumn, but let's fix indexes
    // Drop old camelCase indexes and recreate with snake_case
    const indexes = await queryInterface.showIndex('blog_posts');
    const indexNames = indexes.map(i => i.name);

    // Recreate indexes that reference old column names
    if (indexNames.includes('idx_blog_created') && !indexNames.includes('idx_blog_created_snake')) {
      try {
        await queryInterface.removeIndex('blog_posts', 'idx_blog_created');
        await queryInterface.addIndex('blog_posts', ['created_at'], { name: 'idx_blog_created' });
        console.log('Recreated idx_blog_created with created_at');
      } catch (e) {
        console.log('idx_blog_created index update skipped:', e.message);
      }
    }

    if (indexNames.includes('idx_blog_status_published')) {
      try {
        await queryInterface.removeIndex('blog_posts', 'idx_blog_status_published');
        await queryInterface.addIndex('blog_posts', ['status', 'published_at'], { name: 'idx_blog_status_published' });
        console.log('Recreated idx_blog_status_published');
      } catch (e) {
        console.log('idx_blog_status_published index update skipped:', e.message);
      }
    }

    if (indexNames.includes('idx_blog_post_type')) {
      try {
        await queryInterface.removeIndex('blog_posts', 'idx_blog_post_type');
        await queryInterface.addIndex('blog_posts', ['post_type'], { name: 'idx_blog_post_type' });
        console.log('Recreated idx_blog_post_type');
      } catch (e) {
        console.log('idx_blog_post_type index update skipped:', e.message);
      }
    }

    if (indexNames.includes('idx_blog_created_by')) {
      try {
        await queryInterface.removeIndex('blog_posts', 'idx_blog_created_by');
        await queryInterface.addIndex('blog_posts', ['created_by'], { name: 'idx_blog_created_by' });
        console.log('Recreated idx_blog_created_by');
      } catch (e) {
        console.log('idx_blog_created_by index update skipped:', e.message);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Reverse: rename snake_case back to camelCase
    const renames = [
      ['cover_image', 'coverImage'],
      ['published_at', 'publishedAt'],
      ['post_type', 'postType'],
      ['meta_title', 'metaTitle'],
      ['meta_description', 'metaDescription'],
      ['meta_keywords', 'metaKeywords'],
      ['canonical_url', 'canonicalUrl'],
      ['og_image', 'ogImage'],
      ['reading_time', 'readingTime'],
      ['seo_score', 'seoScore'],
      ['created_by', 'createdBy'],
      ['updated_by', 'updatedBy'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ];

    for (const [oldName, newName] of renames) {
      try {
        await queryInterface.renameColumn('blog_posts', oldName, newName);
      } catch (e) {
        console.log(`Reverse rename ${oldName} -> ${newName} skipped:`, e.message);
      }
    }
  },
};
