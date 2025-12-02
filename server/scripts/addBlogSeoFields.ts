/**
 * Migration script to add SEO fields to blog_posts table
 * Run with: npx tsx server/scripts/addBlogSeoFields.ts
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');
const DB_NAME = process.env.DB_NAME || 'doapp';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

async function migrate() {
  console.log('🚀 Starting BlogPost SEO fields migration...');
  console.log(`📦 Connecting to database: ${DB_NAME}@${DB_HOST}:${DB_PORT}`);

  const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Check if columns exist first
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'blog_posts' AND column_name = 'postType'
    `);

    if ((results as any[]).length > 0) {
      console.log('ℹ️  Columns already exist, skipping migration');
      await sequelize.close();
      return;
    }

    console.log('📝 Adding new columns to blog_posts table...');

    // Create ENUM type for postType if it doesn't exist
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_blog_posts_postType" AS ENUM ('official', 'user');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add postType column
    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "postType" "enum_blog_posts_postType" NOT NULL DEFAULT 'user'
    `);
    console.log('  ✅ Added postType column');

    // Add SEO columns
    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "metaTitle" VARCHAR(70)
    `);
    console.log('  ✅ Added metaTitle column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "metaDescription" VARCHAR(160)
    `);
    console.log('  ✅ Added metaDescription column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "metaKeywords" VARCHAR(255)[] DEFAULT '{}'
    `);
    console.log('  ✅ Added metaKeywords column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "canonicalUrl" VARCHAR(500)
    `);
    console.log('  ✅ Added canonicalUrl column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "ogImage" VARCHAR(500)
    `);
    console.log('  ✅ Added ogImage column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "indexable" BOOLEAN NOT NULL DEFAULT true
    `);
    console.log('  ✅ Added indexable column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "readingTime" INTEGER
    `);
    console.log('  ✅ Added readingTime column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('  ✅ Added featured column');

    await sequelize.query(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS "seoScore" INTEGER NOT NULL DEFAULT 0
    `);
    console.log('  ✅ Added seoScore column');

    // Add indexes
    console.log('📊 Creating indexes...');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_blog_post_type ON blog_posts ("postType")
    `);
    console.log('  ✅ Created idx_blog_post_type index');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_blog_featured ON blog_posts ("featured")
    `);
    console.log('  ✅ Created idx_blog_featured index');

    // Update existing posts to have default SEO values
    console.log('🔄 Updating existing posts with default SEO values...');

    await sequelize.query(`
      UPDATE blog_posts
      SET
        "metaTitle" = SUBSTRING(title, 1, 70),
        "metaDescription" = SUBSTRING(excerpt, 1, 160),
        "readingTime" = GREATEST(1, LENGTH(content) / 1000),
        "seoScore" = 30
      WHERE "metaTitle" IS NULL
    `);
    console.log('  ✅ Updated existing posts');

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('🔒 Database connection closed');
  }
}

migrate();
