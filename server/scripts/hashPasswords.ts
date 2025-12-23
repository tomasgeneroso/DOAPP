import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const hashPasswords = async () => {
  // Use DATABASE_URL or individual env vars
  const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'doapp',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
      };

  const client = new pg.Client(connectionConfig);

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Hash the password using bcryptjs (same as User model)
    const password = '123456';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    console.log('Original password:', password);
    console.log('Hashed password:', hashedPassword);
    console.log('Hash length:', hashedPassword.length);

    // Update ALL users with this hashed password (replace existing hashes)
    const result = await client.query(
      'UPDATE users SET password = $1',
      [hashedPassword]
    );

    console.log(`✅ Updated ${result.rowCount} users with hashed passwords`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
};

hashPasswords();
