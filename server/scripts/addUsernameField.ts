/**
 * Migration Script: Add username field to users table
 *
 * This script adds a unique username column to the users table
 * and generates usernames for existing users based on their name.
 *
 * Run with: npx tsx server/scripts/addUsernameField.ts
 */

import { Sequelize, QueryTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'doapp',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false,
  }
);

/**
 * Generate a unique username from a name
 */
function generateUsername(name: string): string {
  // Remove accents and special characters
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .replace(/\s+/g, '.'); // Replace spaces with dots

  // Ensure minimum length
  if (normalized.length < 3) {
    return normalized + '.' + Math.random().toString(36).substring(2, 6);
  }

  // Truncate if too long
  return normalized.substring(0, 25);
}

async function migrate() {
  try {
    console.log('🚀 Starting username migration...');
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if column already exists
    const [columns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'username'
    `);

    if ((columns as any[]).length > 0) {
      console.log('⚠️  Column "username" already exists');

      // Check if there are users without username
      const [usersWithoutUsername] = await sequelize.query(`
        SELECT id, name FROM users WHERE username IS NULL OR username = ''
      `);

      if ((usersWithoutUsername as any[]).length > 0) {
        console.log(`📝 Found ${(usersWithoutUsername as any[]).length} users without username, generating...`);

        for (const user of usersWithoutUsername as any[]) {
          let baseUsername = generateUsername(user.name);
          let username = baseUsername;
          let counter = 1;

          // Check for uniqueness
          while (true) {
            const [existing] = await sequelize.query(
              `SELECT id FROM users WHERE username = :username AND id != :userId`,
              { replacements: { username, userId: user.id }, type: QueryTypes.SELECT }
            );

            if (!existing) break;

            username = `${baseUsername}${counter}`;
            counter++;
          }

          await sequelize.query(
            `UPDATE users SET username = :username WHERE id = :userId`,
            { replacements: { username, userId: user.id } }
          );

          console.log(`  ✅ ${user.name} -> @${username}`);
        }
      }
    } else {
      // Add the column (nullable first)
      console.log('📝 Adding username column...');
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN username VARCHAR(30)
      `);
      console.log('✅ Column added');

      // Get all existing users
      const [users] = await sequelize.query(`
        SELECT id, name FROM users
      `);

      console.log(`📝 Generating usernames for ${(users as any[]).length} users...`);

      const usedUsernames = new Set<string>();

      for (const user of users as any[]) {
        let baseUsername = generateUsername(user.name);
        let username = baseUsername;
        let counter = 1;

        // Ensure uniqueness
        while (usedUsernames.has(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        usedUsernames.add(username);

        await sequelize.query(
          `UPDATE users SET username = :username WHERE id = :userId`,
          { replacements: { username, userId: user.id } }
        );

        console.log(`  ✅ ${user.name} -> @${username}`);
      }

      // Make column NOT NULL and add unique constraint
      console.log('📝 Adding constraints...');
      await sequelize.query(`
        ALTER TABLE users ALTER COLUMN username SET NOT NULL
      `);
      await sequelize.query(`
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username)
      `);

      // Add index
      console.log('📝 Adding index...');
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)
      `);

      console.log('✅ Constraints and index added');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Update registration to require username');
    console.log('2. Update profile routes to use username');
    console.log('3. Update frontend links to use /u/{username}');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

migrate();
